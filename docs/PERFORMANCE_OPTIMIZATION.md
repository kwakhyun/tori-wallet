# ⚡ Performance Optimization Guide

Tori Wallet에 실제 적용된 성능 최적화와 아직 측정이 필요한 항목을 구분해 정리한 문서입니다.

## 목차

1. [렌더링 경계 관리](#1-렌더링-경계-관리)
2. [리스트 렌더링](#2-리스트-렌더링)
3. [React Query 캐싱](#3-react-query-캐싱)
4. [네트워크와 비동기 흐름](#4-네트워크와-비동기-흐름)
5. [Realm 로컬 DB](#5-realm-로컬-db)
6. [번들 구성](#6-번들-구성)
7. [측정과 모니터링](#7-측정과-모니터링)

---

## 1. 렌더링 경계 관리

### Zustand 선택 구독

화면과 훅에서 스토어 전체를 구독하지 않고 필요한 상태와 액션만 선택합니다. 여러 값을 함께 구독할 때는 `useShallow`를 사용해 관련 없는 상태 변경으로 인한 리렌더링을 줄입니다.

```tsx
const { address, activeNetworkChainId } = useWalletStore(
  useShallow(state => ({
    address: state.address,
    activeNetworkChainId: state.activeNetworkChainId,
  })),
);
```

현재 화면, 내비게이터, 공통 컴포넌트와 훅을 합쳐 19개 소비자에 선택 구독을 적용했습니다.

### `useCallback`과 `useMemo`

모든 함수와 계산을 일괄 메모이제이션하지 않습니다. 자식 컴포넌트나 `FlatList`에 전달되는 콜백, 의존성이 분명한 파생 데이터처럼 참조 안정성이 실제로 필요한 곳에 사용합니다.

```tsx
const renderTransaction = useCallback(
  ({ item }: { item: Transaction }) => (
    <TransactionItem transaction={item} onPress={handleTransactionPress} />
  ),
  [handleTransactionPress],
);

const transactions = useMemo(() => {
  if (apiTransactions?.length) return apiTransactions;
  return cachedTransactions.map(mapCachedTransaction);
}, [apiTransactions, cachedTransactions]);
```

대표 적용 화면은 `ActivityScreen`, `ExploreScreen`, `PortfolioScreen`, `SendTransactionScreen`, `SettingsScreen`, `SwapScreen`입니다. 개수 자체는 리팩터링에 따라 달라질 수 있으므로 성능 판단 기준으로 사용하지 않습니다.

---

## 2. 리스트 렌더링

트랜잭션, 토큰, 주소록처럼 항목 수가 늘어날 수 있는 화면은 `ScrollView` 대신 React Native의 가상화 리스트인 `FlatList`를 사용합니다.

```tsx
<FlatList
  data={transactions}
  renderItem={renderTransaction}
  keyExtractor={item => item.hash}
  ListEmptyComponent={renderEmpty}
  showsVerticalScrollIndicator={false}
/>
```

**적용 화면:**

- `ActivityScreen`: 트랜잭션 히스토리
- `ExploreScreen`: 코인 목록과 검색 결과
- `SwapScreen`: 토큰 선택 모달
- `AddressBookScreen`: 주소록 목록
- `PortfolioScreen`: 토큰 목록
- `SwapHistoryScreen`: 스왑 히스토리

항목 키에는 해시나 ID처럼 고유하고 안정적인 값을 사용합니다. `windowSize`, `getItemLayout`, `removeClippedSubviews` 같은 추가 옵션은 항목 높이와 스크롤 특성을 측정한 뒤 화면별로 적용해야 하며, 현재 공통 적용 사항은 아닙니다.

---

## 3. React Query 캐싱

`queryClient.ts`는 쿼리에 30초의 기본 `staleTime`, 5분의 `gcTime`, 포커스 및 네트워크 복구 시 재검증, 재시도 가능한 오류에 대한 지수 백오프를 설정합니다. 쿼리는 최대 3회까지 재시도합니다. 뮤테이션 기본값도 최대 2회로 구성되어 있지만 현재 앱에는 React Query 뮤테이션 소비자가 없습니다.

```typescript
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchOnMount: true,
        networkMode: 'offlineFirst',
        retry: (failureCount, error) =>
          failureCount < 3 && isRetryableError(error),
        retryDelay: calculateRetryDelay,
      },
    },
  });
}
```

현재 React Query 관리 범위는 네이티브 코인 및 ERC-20 잔액, 트랜잭션 히스토리, 포트폴리오 토큰 조회입니다. 네이티브 잔액은 30초, ERC-20 잔액은 10초, 트랜잭션과 포트폴리오는 30초의 `staleTime`을 사용합니다. 가스 추정과 스왑 견적은 별도 서비스 흐름으로 처리하므로 React Query 캐시 범위에 포함하지 않습니다.

재시도 지연은 1초부터 시작해 최대 30초까지 증가하며 0~25% 지터를 더합니다. 네트워크 오류, 429 응답, 일부 5xx 오류만 재시도합니다.

---

## 4. 네트워크와 비동기 흐름

### 연결과 앱 상태 연동

NetInfo 상태를 TanStack Query의 `onlineManager`에 연결하고, 앱이 활성 상태로 돌아오면 `focusManager`를 갱신합니다. `offlineFirst`는 해당 쿼리가 보유한 캐시를 먼저 활용한다는 의미이며, 앱 전체 기능을 오프라인에서 보장한다는 뜻은 아닙니다.

### 오래된 응답 차단

사용자가 네트워크나 검색어를 빠르게 바꿀 때 이전 요청이 최신 화면을 덮어쓰지 않도록 요청 순서를 확인합니다.

- `ExploreScreen`: 요청 ID가 최신 검색과 일치할 때만 결과와 오류를 반영합니다.
- `PortfolioScreen`: 요청 ID를 확인하고 독립적인 통계와 차트 조회는 `Promise.all`로 병렬 실행합니다.
- `HomeScreen`: 네이티브 가격 조회가 끝나기 전에 네트워크가 바뀌거나 화면이 정리되면 이전 결과를 반영하지 않습니다.

---

## 5. Realm 로컬 DB

Realm에는 8개 스키마가 있으며 6개 서비스가 주소록, 트랜잭션 캐시, 토큰 목록, WalletConnect 로그, 동기화 상태, 사용자 설정을 관리합니다. `BalanceSnapshot` 저장 API도 동기화 상태 서비스에 포함되지만 현재 잔액 및 토큰 화면의 오프라인 대체 데이터로 연결되어 있지는 않습니다.

| 데이터                          | 사용 목적                                        |
| ------------------------------- | ------------------------------------------------ |
| 트랜잭션 캐시                   | API 응답이 없을 때 최근 히스토리 표시            |
| 주소록                          | 수신 주소와 메모 저장                            |
| 토큰 목록                       | 숨김, 스팸, 사용자 지정 토큰 설정과 최근 값 저장 |
| WalletConnect 세션 및 요청 로그 | 연결과 요청 이력 관리                            |
| 동기화 상태                     | 마지막 동기화 시점과 오류 기록                   |
| 잔액 스냅샷                     | 저장 및 조회 API 제공, 현재 화면 미연결          |
| 사용자 설정                     | 앱 설정 저장                                     |

`ActivityScreen`은 API 트랜잭션을 우선 사용하고 데이터가 없으면 Realm 캐시를 표시합니다. 이 구조는 최근 로컬 데이터 접근성을 높이지만 블록체인 원장의 완전한 오프라인 동기화를 의미하지 않습니다.

---

## 6. 번들 구성

`viem` 같은 라이브러리는 필요한 API를 이름으로 가져와 번들러가 사용하지 않는 코드를 제거할 수 있게 합니다.

```typescript
import { createPublicClient, formatEther, parseEther } from 'viem';
```

아이콘은 `react-native-svg`를 사용하고 앱 이미지는 플랫폼별 해상도로 관리합니다. 화면이나 QR 스캐너의 동적 임포트는 현재 적용된 최적화가 아닙니다. 번들 분석에서 효과가 확인될 때 도입할 후보입니다.

---

## 7. 측정과 모니터링

개발 중에는 React DevTools Profiler와 실제 기기의 릴리스 빌드로 렌더링 시간, 스크롤 끊김, 메모리 사용량을 확인합니다.

```bash
yarn start --verbose
```

현재 Firebase Performance Monitoring, Sentry 같은 원격 성능 및 크래시 수집 SDK는 연결되어 있지 않습니다. 아래 값은 측정 완료 결과가 아니라 향후 릴리스 검증에 사용할 목표입니다.

| 항목          | 목표                          |
| ------------- | ----------------------------- |
| 초기 로딩     | 3초 미만                      |
| 화면 전환     | 300ms 미만                    |
| 리스트 스크롤 | 60fps 유지                    |
| 메모리 누수   | 장시간 사용 시 지속 증가 없음 |
| 앱 크기       | 설치 산출물 기준 50MB 미만    |

## 요약

| 최적화                    | 현재 적용 범위                               |
| ------------------------- | -------------------------------------------- |
| Zustand 선택 구독         | 화면, 내비게이터, 컴포넌트와 훅 19개         |
| `useCallback` / `useMemo` | 참조 안정성이나 파생 계산이 필요한 주요 화면 |
| `FlatList`                | 목록이 커질 수 있는 6개 화면                 |
| React Query               | 잔액, 토큰, 트랜잭션, 포트폴리오 쿼리        |
| 오프라인 우선 쿼리        | React Query로 관리하는 조회                  |
| Realm                     | 8개 스키마, 6개 서비스                       |
| 지수 백오프               | 재시도 가능한 React Query 오류               |

## 참고 자료

- [React Native Performance](https://reactnative.dev/docs/performance)
- [TanStack Query Caching](https://tanstack.com/query/latest/docs/framework/react/guides/caching)
- [FlatList Optimization](https://reactnative.dev/docs/optimizing-flatlist-configuration)
