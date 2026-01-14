# ⚡ Performance Optimization Guide

Tori Wallet에 적용된 성능 최적화 기법을 정리한 문서입니다.

## 목차

1. [React 메모이제이션](#1-react-메모이제이션)
2. [리스트 렌더링 최적화](#2-리스트-렌더링-최적화)
3. [React Query 캐싱 전략](#3-react-query-캐싱-전략)
4. [네트워크 최적화](#4-네트워크-최적화)
5. [Realm 로컬 DB 활용](#5-realm-로컬-db-활용)
6. [번들 크기 최적화](#6-번들-크기-최적화)
7. [측정 및 모니터링](#7-측정-및-모니터링)

---

## 1. React 메모이제이션

### useCallback 활용

이벤트 핸들러와 콜백 함수를 메모이제이션하여 불필요한 리렌더링 방지:

```tsx
// ✅ Good - useCallback으로 핸들러 메모이제이션
const handleRefresh = useCallback(async () => {
  setForceRefresh(true);
  await refetchApi();
  setForceRefresh(false);
}, [refetchApi]);

// ✅ Good - FlatList renderItem 메모이제이션
const renderCoinItem = useCallback(
  ({ item }: { item: Coin }) => (
    <CoinItem coin={item} onPress={() => handleCoinPress(item)} />
  ),
  [handleCoinPress],
);
```

**적용 현황:**

- `SendTransactionScreen`: 11개 useCallback
- `SettingsScreen`: 18개 useCallback
- `SwapScreen`: 6개 useCallback
- `ExploreScreen`: 6개 useCallback
- Realm 훅들: 각 5-10개 useCallback

### useMemo 활용

비용이 큰 계산 결과를 메모이제이션:

```tsx
// ✅ Good - 복잡한 필터링/정렬 결과 메모이제이션
const transactions: Transaction[] = React.useMemo(() => {
  if (apiTransactions && apiTransactions.length > 0) {
    return apiTransactions;
  }
  return cachedTransactions.map(tx => ({
    hash: tx.hash,
    // ... 변환 로직
  }));
}, [apiTransactions, cachedTransactions]);

// ✅ Good - 조건부 렌더링 값 메모이제이션
const canSwap = useMemo(() => {
  return (
    fromToken && toToken && fromAmount > 0 && !isLoading && sufficientBalance
  );
}, [fromToken, toToken, fromAmount, isLoading, sufficientBalance]);
```

**적용 현황:**

- `ActivityScreen`: transactions 필터링
- `SwapScreen`: tokens, canSwap, priceInfo
- `useDexData`: swaps, ethPrice, priceHistory

---

## 2. 리스트 렌더링 최적화

### FlatList 활용

ScrollView 대신 FlatList로 대량 데이터 효율적 렌더링:

```tsx
<FlatList
  data={transactions}
  renderItem={renderTransaction}
  keyExtractor={item => item.hash}
  ListEmptyComponent={renderEmpty}
  showsVerticalScrollIndicator={false}
  // 성능 최적화 props
  removeClippedSubviews={true} // 화면 밖 아이템 언마운트
  maxToRenderPerBatch={10} // 배치당 최대 렌더링 수
  initialNumToRender={10} // 초기 렌더링 수
  windowSize={5} // 렌더링 윈도우 크기
  getItemLayout={(data, index) => ({
    // 고정 높이 최적화
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  })}
/>
```

**FlatList 사용 화면:**

- `ActivityScreen`: 트랜잭션 히스토리
- `ExploreScreen`: 코인 목록, 검색 결과
- `SwapScreen`: 토큰 선택 모달
- `AddressBookScreen`: 주소록 목록
- `PortfolioScreen`: 토큰 목록
- `SwapHistoryScreen`: 스왑 히스토리

### keyExtractor 최적화

고유하고 안정적인 키 사용:

```tsx
// ✅ Good - 고유 ID 사용
keyExtractor={item => item.hash}
keyExtractor={item => item.id}

// ❌ Bad - 인덱스 사용 (리스트 변경 시 성능 저하)
keyExtractor={(item, index) => index.toString()}
```

---

## 3. React Query 캐싱 전략

### 전역 설정 (queryClient.ts)

```typescript
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 캐싱 설정
        staleTime: 30 * 1000, // 30초 동안 fresh 상태
        gcTime: 5 * 60 * 1000, // 5분 동안 캐시 유지

        // 리페치 설정
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchOnMount: true,

        // 오프라인 모드
        networkMode: 'offlineFirst', // 캐시 우선 사용

        // 재시도 설정
        retry: (failureCount, error) => {
          if (failureCount >= 3) return false;
          return isRetryableError(error);
        },
        retryDelay: attemptIndex => calculateRetryDelay(attemptIndex),
      },
    },
  });
}
```

### 쿼리별 staleTime 설정

데이터 특성에 맞는 캐시 전략:

| 데이터 유형       | staleTime | 이유                           |
| ----------------- | --------- | ------------------------------ |
| 잔액 (Balance)    | 30초      | 자주 변경되나 즉시 반영 불필요 |
| 가스비 (Gas)      | 10초      | 네트워크 상태에 민감           |
| 트랜잭션 히스토리 | 30초      | 자주 변경되지 않음             |
| 스왑 견적         | 10초      | 시세 변동에 민감               |
| 포트폴리오        | 30초      | 여러 소스 집계                 |

```typescript
// useBalance.ts
const { data: balance } = useQuery({
  queryKey: ['balance', address, chainId],
  queryFn: () => fetchBalance(address, chainId),
  staleTime: 30 * 1000, // 30초
});

// useSwap.ts
const { data: quote } = useQuery({
  queryKey: ['swapQuote', fromToken, toToken, amount],
  queryFn: () => getSwapQuote(fromToken, toToken, amount),
  staleTime: 10 * 1000, // 10초 (시세 변동 고려)
});
```

### 지수 백오프 재시도

네트워크 에러 시 점진적 재시도:

```typescript
function calculateRetryDelay(attemptIndex: number): number {
  const baseDelay = 1000; // 1초
  const maxDelay = 30000; // 최대 30초

  // 지수 백오프: 1초 → 2초 → 4초 → 8초...
  const exponentialDelay = Math.min(
    maxDelay,
    baseDelay * Math.pow(2, attemptIndex),
  );

  // 지터 추가 (0-25% 랜덤) - Thundering Herd 방지
  const jitter = exponentialDelay * Math.random() * 0.25;

  return exponentialDelay + jitter;
}
```

---

## 4. 네트워크 최적화

### 네트워크 상태 감지

오프라인 시 자동으로 쿼리 일시정지:

```typescript
// queryClient.ts
export function setupNetworkListener(): () => void {
  const unsubscribe = NetInfo.addEventListener(state => {
    const isOnline = state.isConnected && state.isInternetReachable !== false;
    onlineManager.setOnline(isOnline ?? true);

    if (isOnline) {
      logger.info('Network restored, resuming queries');
    } else {
      logger.warn('Network lost, pausing queries');
    }
  });

  return unsubscribe;
}
```

### 앱 포커스 상태 연동

백그라운드에서 복귀 시 stale 데이터 자동 새로고침:

```typescript
export function setupAppFocusListener(): () => void {
  const onAppStateChange = (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  };

  const subscription = AppState.addEventListener('change', onAppStateChange);
  return () => subscription.remove();
}
```

### 오프라인 퍼스트 전략

네트워크 불안정 시에도 사용자 경험 유지:

```typescript
networkMode: 'offlineFirst', // 캐시 데이터 우선 표시
```

---

## 5. Realm 로컬 DB 활용

### 오프라인 데이터 캐싱

네트워크 없이도 핵심 데이터 접근 가능:

| 데이터        | 저장소 | 용도                   |
| ------------- | ------ | ---------------------- |
| 트랜잭션 캐시 | Realm  | 오프라인 히스토리 조회 |
| 주소록        | Realm  | 자주 쓰는 주소 저장    |
| 토큰 설정     | Realm  | 숨김/스팸 토큰 관리    |
| WC 세션 로그  | Realm  | 연결 히스토리          |
| 동기화 상태   | Realm  | 마지막 동기화 시점     |
| 사용자 설정   | Realm  | 테마, 알림 등          |

### API-캐시 하이브리드

```typescript
// ActivityScreen.tsx
// API 데이터 우선, 없으면 캐시 사용
const transactions: Transaction[] = React.useMemo(() => {
  if (apiTransactions && apiTransactions.length > 0) {
    return apiTransactions;
  }
  return cachedTransactions.map(tx => ({...}));
}, [apiTransactions, cachedTransactions]);
```

### 데이터 동기화

```typescript
// 백그라운드에서 캐시 업데이트
useEffect(() => {
  const syncToCache = async () => {
    if (apiTransactions?.length && !hasSynced) {
      await transactionCacheService.syncTransactions(transactionsToSync);
      setHasSynced(true);
    }
  };
  syncToCache();
}, [apiTransactions, hasSynced]);
```

---

## 6. 번들 크기 최적화

### Tree Shaking

viem 등 라이브러리에서 필요한 함수만 임포트:

```typescript
// ✅ Good - 필요한 것만 임포트
import { formatEther, parseEther, createPublicClient } from 'viem';

// ❌ Bad - 전체 임포트
import * as viem from 'viem';
```

### 동적 임포트 (필요시)

무거운 모듈은 필요할 때 로드:

```typescript
// QR 스캐너는 사용 시점에 로드
const QRScanner = React.lazy(() => import('./QRScanner'));
```

### 이미지 최적화

- SVG 아이콘 사용 (react-native-svg)
- 적절한 해상도 이미지 (1x, 2x, 3x)

---

## 7. 측정 및 모니터링

### 개발 환경 성능 측정

```bash
# Metro 번들러 성능 로깅
yarn start --verbose

# React DevTools Profiler
# - 컴포넌트 렌더링 시간 측정
# - 불필요한 리렌더링 감지
```

### 프로덕션 모니터링

Firebase Performance Monitoring 또는 Sentry를 통한 모니터링 구성 가능:

- 크래시 리포트
- ANR (Application Not Responding) 감지
- 성능 메트릭 수집

### 성능 목표

| 항목          | 목표    |
| ------------- | ------- |
| 초기 로딩     | < 3초   |
| 화면 전환     | < 300ms |
| 리스트 스크롤 | 60fps   |
| 메모리 누수   | 없음    |
| 번들 크기     | < 50MB  |

---

## 요약

| 최적화 기법         | 적용 범위       | 효과                 |
| ------------------- | --------------- | -------------------- |
| useCallback/useMemo | 모든 화면       | 리렌더링 감소        |
| FlatList            | 리스트 화면 6개 | 메모리 효율화        |
| React Query 캐싱    | API 호출 전체   | 네트워크 요청 감소   |
| 오프라인 퍼스트     | 전체 앱         | 네트워크 불안정 대응 |
| Realm 캐싱          | 6개 서비스      | 오프라인 UX          |
| 지수 백오프         | API 재시도      | 서버 부하 분산       |

---

## 참고 자료

- [React Native Performance](https://reactnative.dev/docs/performance)
- [TanStack Query Caching](https://tanstack.com/query/latest/docs/react/guides/caching)
- [FlatList Optimization](https://reactnative.dev/docs/optimizing-flatlist-configuration)
