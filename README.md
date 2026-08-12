# Tori Wallet 🦊

[![React Native](https://img.shields.io/badge/React%20Native-0.83-61DAFB?logo=react)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Viem](https://img.shields.io/badge/Viem-2.55-646CFF)](https://viem.sh/)
[![Tests](https://img.shields.io/badge/Tests-1292%20passed-brightgreen)](/)
[![Coverage](https://img.shields.io/badge/Services-89.14%25-brightgreen)](/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **React Native + TypeScript 기반 셀프 커스터디 Web3 모바일 지갑**
> 멀티체인, Reown WalletKit 기반 WalletConnect v2, 0x Swap API v2 연동을 지원하는 소프트웨어 지갑

> 토리월렛은 하드웨어 콜드월렛이 아닙니다. 키를 서버로 전송하지 않지만, 실행 중인 모바일 OS의 무결성을 보안 경계로 신뢰합니다. 외부 전문 보안 감사를 완료했다는 의미는 아닙니다.

---

## 🎯 프로젝트 개요

### 목적

블록체인 기술의 복잡성을 숨기고, 누구나 쉽고 안전하게 디지털 자산을 관리할 수 있는 사용자 친화적인 Web3 지갑 개발

### 핵심 가치

- **사용성**: 직관적인 UI/UX로 Web3 진입 장벽 낮추기
- **안정성**: 사용자 자산을 다루는 서비스 특성상 작은 실수도 치명적임을 인지하고, 철저한 테스트와 에러 처리
- **확장성**: 멀티체인 및 다양한 dApp 연동 지원

### 기술 스택 요약

| 항목              | 기술                                     |
| ----------------- | ---------------------------------------- |
| **Framework**     | React Native 0.83, TypeScript 5.8        |
| **Blockchain**    | Viem 2.55, Reown WalletKit               |
| **상태 관리**     | Zustand, React Query (TanStack Query v5) |
| **로컬 DB**       | Realm                                    |
| **스타일링**      | styled-components                        |
| **테스트**        | Jest, Detox                              |
| **패키지 매니저** | Yarn                                     |

---

## ⚡ Quick Start

```bash
# 의존성 설치
yarn install

# iOS Pod 설치
cd ios && pod install && cd ..

# 환경변수 설정
cp .env.example .env
```

### 환경 변수 설정

`.env` 파일을 생성하고 다음 값들을 설정하세요:

| 변수                       | 필수 | 용도                      | 발급처                                                 |
| -------------------------- | :--: | ------------------------- | ------------------------------------------------------ |
| `WALLETCONNECT_PROJECT_ID` |  ⚠️  | dApp 연결                 | [WalletConnect Cloud](https://cloud.walletconnect.com) |
| `SWAP_API_BASE_URL`        | 운영 | 0x 키를 보관하는 스왑 프록시 | 자체 백엔드 |
| `ALCHEMY_API_KEY`          | 권장 | 안정적인 RPC              | [Alchemy](https://dashboard.alchemy.com)               |
| `COINGECKO_API_KEY`        | 선택 | 가격 조회 Rate Limit 상향 | [CoinGecko](https://www.coingecko.com/en/api)          |

> ⚠️ 모바일 앱의 환경 변수는 비밀이 아닙니다. 0x API 키는 반드시 서버에만 보관하세요. 개발 빌드는 키 없이 0x를 직접 호출하며, 운영 빌드는 `SWAP_API_BASE_URL`이 없으면 스왑을 비활성화합니다.

```bash
# 실행
yarn ios     # iOS
yarn android # Android
```

---

## 📱 주요 기능

### 🔐 지갑 관리

- **HD 지갑**: BIP-39/BIP-44 표준 기반 니모닉 지갑 생성/복구
- **다중 계정**: 하나의 니모닉으로 여러 계정 파생
- **생체인증**: Face ID / Touch ID 지원

### ⛓️ 멀티체인

- Ethereum, Polygon, Arbitrum, Optimism, Base 등 주요 L1/L2
- 네트워크 간 원활한 전환

### 🔗 dApp 연동

- **WalletConnect v2 / Reown WalletKit**: dApp 연결과 세션 관리
- Verify API의 `INVALID`·사기 출처 자동 차단, 미검증 출처 명시적 확인
- 메시지·EIP-712·트랜잭션 원문 표시, 위험 권한 경고 및 확인 내용-서명 바인딩
- 연결된 세션 관리 및 로그 기록

### 🔄 토큰 스왑

- **0x Swap API v2** 집계 경로와 AllowanceHolder 승인 모델
- 토큰·수량·taker·승인 대상·실행 대상·최소 수령량·시뮬레이션 결과 검증
- 확정 견적과 검토 화면을 지문으로 바인딩하고 90초가 지나거나 내용이 바뀌면 재검토

### 📊 포트폴리오 분석

- 자산 현황 시각화 (파이 차트, 라인 차트)
- 수익률 추적, 토큰별 분포

### 💸 트랜잭션

- 네이티브/ERC-20 토큰 전송
- 실시간 가스비 추정
- 트랜잭션 상태 추적

---

## 🏗 아키텍처

### 레이어 구조

```
┌─────────────────────────────────────────────────────────────┐
│  UI Layer                                                    │
│  └── Screens, Components, Navigation                        │
├─────────────────────────────────────────────────────────────┤
│  State Management                                            │
│  ├── Zustand: 클라이언트 상태 (지갑, 설정)                    │
│  └── React Query: 서버 상태 (잔액, 가스, TX)                 │
├─────────────────────────────────────────────────────────────┤
│  Local Storage                                               │
│  ├── Realm: 주소록, TX 캐시, 토큰 설정, WC 로그              │
│  ├── AsyncStorage: 단순 설정                                 │
│  ├── EncryptedStorage: PIN 암호화 지갑 볼트                  │
│  └── Keychain/Keystore: 생체인증 보호 자격 증명              │
├─────────────────────────────────────────────────────────────┤
│  Services Layer                                              │
│  ├── walletService    │ chainClient   │ txService           │
│  ├── wcService        │ swapService   │ coinService         │
│  └── portfolioAnalyticsService                               │
└─────────────────────────────────────────────────────────────┘
```

### 폴더 구조

```
src/
├── components/       # 재사용 컴포넌트
│   ├── common/       # Button, Input, Card, Skeleton 등
│   ├── charts/       # LineChart, PieChart
│   └── swap/         # SwapReviewModal, SwapSettingsModal
├── config/           # QueryClient 설정
├── hooks/            # useBalance, useWallet, useAppState 등
├── navigation/       # React Navigation 설정
├── realm/            # Realm 로컬 데이터베이스
│   ├── schemas/      # 스키마 정의 (6개)
│   ├── services/     # CRUD 서비스
│   └── hooks/        # React 훅
├── screens/          # 화면 컴포넌트 (15+)
├── services/         # 비즈니스 로직
│   ├── chainClient.ts    # 멀티체인 RPC (Viem)
│   ├── walletService.ts  # 지갑 관리
│   ├── signerVault.ts    # 잠금 해제 세션과 계정 바인딩
│   ├── signingIntentService.ts # 서명 의도 분석/지문
│   ├── txService.ts      # 트랜잭션 처리
│   ├── wcService.ts      # Reown WalletKit/Verify
│   └── swapService.ts    # 0x v2 견적 검증
├── store/            # Zustand 스토어
├── styles/           # 테마, 공통 스타일
└── utils/            # 유틸리티 함수
```

---

## 📦 기술 스택

| 분류              | 기술                                      |
| ----------------- | ----------------------------------------- |
| **Framework**     | React Native 0.83 + TypeScript 5.8        |
| **Blockchain**    | Viem (Ethereum 인터랙션)                  |
| **dApp 연결**     | Reown WalletKit + WalletConnect v2        |
| **상태 관리**     | Zustand + React Query (TanStack Query v5) |
| **로컬 DB**       | Realm                                     |
| **스타일링**      | styled-components/native                  |
| **네비게이션**    | React Navigation 7                        |
| **보안 저장소**   | react-native-keychain                     |
| **테스트**        | Jest, React Testing Library, Detox        |
| **패키지 매니저** | Yarn                                      |

### 💡 기술 선택 이유

| 기술            | 선택 이유                                                           |
| --------------- | ------------------------------------------------------------------- |
| **Viem**        | ethers.js 대비 번들 크기 50% 감소, 우수한 TypeScript 지원, 모던 API |
| **Zustand**     | Redux 대비 보일러플레이트 최소화, 직관적 API, 2KB 번들 크기         |
| **React Query** | 서버 상태 캐싱 자동화, 중복 요청 제거, stale-while-revalidate 전략  |
| **Realm**       | React Native 통합 우수, 실시간 동기화, 오프라인 퍼스트 지원         |

---

## 🛡️ 안정성 설계

> 사용자 자산을 다루는 서비스 특성상 작은 실수도 치명적임을 인지하고, 안정성을 최우선으로 설계

### 보안

- **Fail-closed 키 생성**: iOS `SecRandomCopyBytes` / Android `SecureRandom` 기반 OS CSPRNG만 허용하고, 구형 Chrome 원격 디버거의 `Math.random` 폴백·반복/비정상 출력을 차단
- **니모닉 노출 최소화**: 온보딩 중 메모리 전용 10분 세션에만 보관하며 백그라운드 전환, 완료, 취소 시 제거. 백업 문구의 클립보드 복사 미지원
- **암호화 볼트**: scrypt 키 분리 + AES-256-CBC + HMAC-SHA256(Encrypt-then-MAC), 생체인증 자격 증명은 기기 전용 Keychain/Keystore 정책 적용
- **Clear signing**: 전체 계정·대상·수량·calldata/EIP-712 원문과 위험 권한을 표시하고, 확인한 요청 지문이 서명 직전까지 동일한지 검증
- **스왑 무결성**: 0x v2 응답의 intent/quote 지문, AllowanceHolder, 실행 대상, 잔액·시뮬레이션·최소 수령량을 검증
- **피싱 방어**: WalletConnect Verify의 `INVALID`/사기 출처와 만료·세션 범위 밖 요청 자동 거부
- **앱 생명주기**: 백그라운드 전환 시 서명 세션과 온보딩 니모닉을 폐기하고 자동 잠금 정책 적용
- **공급망 검사**: 해시 고정 GitHub Actions, Dependabot, CodeQL, dependency-review, 주간 OSV 검사

2026년 8월 COLDCARD 예측 가능 난수 사건과 토리월렛 적용성은 [보안 검토 보고서](docs/SECURITY_REVIEW_2026-08.md)에 기록했습니다. 현재 코드에서 동일한 **비보안 난수로의 조용한 폴백** 경로는 차단했지만, 이는 외부 전문 감사나 기존 지갑 엔트로피의 소급 증명을 대신하지 않습니다.

### API 오류·지연 등 예외 상황 대응

| 상황              | 대응 전략                                 |
| ----------------- | ----------------------------------------- |
| **네트워크 오류** | React Query 지수 백오프 재시도 (최대 3회) |
| **API 지연**      | 로딩 상태 표시 + 타임아웃 처리            |
| **오프라인**      | Realm 캐시 데이터 표시 + 동기화 상태 안내 |
| **Rate Limit**    | 요청 큐잉 + 백오프 재시도                 |
| **트랜잭션 실패** | 상세 에러 메시지 + 재시도 가이드          |

### 에러 처리

- **ErrorBoundary**: 컴포넌트 레벨 크래시 방지, 복구 화면 제공
- **체계적인 에러 코드**: 사용자 친화적 한국어 메시지
- **에러 로깅**: 디버깅을 위한 상세 로그 기록

### 오프라인 UX (Realm 기반)

- 잔액 스냅샷: 마지막 동기화 잔액 로컬 저장
- 토큰 리스트 캐싱: 네트워크 없이도 토큰 정보 표시
- 펜딩 트랜잭션 추적: 로컬에서 생성한 TX 상태 자동 추적

---

## ⚡ 성능 최적화

| 최적화 기법         | 적용 범위   | 효과                   |
| ------------------- | ----------- | ---------------------- |
| useCallback/useMemo | 전체 화면   | 불필요한 리렌더링 방지 |
| FlatList 가상화     | 리스트 화면 | 메모리 효율화          |
| React Query 캐싱    | API 전체    | 네트워크 요청 감소     |
| Realm 캐싱          | 6개 서비스  | 오프라인 UX            |
| 지수 백오프 재시도  | API 에러    | 서버 부하 분산         |

---

## 🧪 테스트

```bash
yarn test              # 단위/통합 테스트
yarn test:coverage     # 커버리지 리포트
yarn e2e:build:ios     # E2E용 iOS 앱 빌드
yarn e2e:ios           # E2E 테스트 (iOS)
yarn e2e:build:android # E2E용 Android 앱 빌드
yarn e2e:android       # E2E 테스트 (Android)
```

### 테스트 현황

| 항목              | 2026-08-12 검증 결과                     |
| ----------------- | ---------------------------------------- |
| **테스트 스위트** | 88개 통과                               |
| **테스트 케이스** | 1,292개 통과                            |
| **정적 검사**     | TypeScript, ESLint 통과                 |
| **의존성 검사**   | OSV 1,229개 잠금 패키지, 조치 대상 0개 |
| **네이티브 빌드** | Android Debug / iOS Simulator 통과      |
| **E2E 테스트**    | 이번 보안 개선에서는 재실행하지 않음    |

> OSV의 `image-size@1.2.1` 고위험 DoS 2건은 업스트림 수정 버전이 없어 로컬 패치와 종료 회귀 테스트로 완화했으며, 예외는 2026-10-01에 만료됩니다. 만료 전 업스트림 릴리스로 교체해야 합니다.

### 커버리지 요약

| 레이어     | Statements | Branches | Functions | Lines  |
| ---------- | ---------- | -------- | --------- | ------ |
| **전체**   | 61.98%     | 50.51%   | 57.37%    | 62.57% |
| **서비스** | 89.14%     | 77.54%   | 97.10%    | 90.64% |
| **스토어** | 93.62%     | 77.36%   | 95.12%    | 93.50% |
| **유틸**   | 91.25%     | 86.70%   | 93.05%    | 92.21% |

---

## 🔧 환경 변수

```bash
cp .env.example .env
```

```env
WALLETCONNECT_PROJECT_ID=your_project_id
SWAP_API_BASE_URL=https://your-swap-proxy.example
ALCHEMY_API_KEY=your_alchemy_key
COINGECKO_API_KEY=optional_key
```

> 운영 빌드에서 `SWAP_API_BASE_URL`은 필수이며 0x API 키는 프록시 서버에만 저장합니다.

---

## 📝 스크립트

| Script               | Description             |
| -------------------- | ----------------------- |
| `yarn start`         | Metro 개발 서버         |
| `yarn ios`           | iOS 시뮬레이터 실행     |
| `yarn android`       | Android 에뮬레이터 실행 |
| `yarn test`          | Jest 테스트             |
| `yarn test:coverage` | 커버리지 리포트         |
| `yarn lint`          | ESLint 검사             |
| `yarn typecheck`     | TypeScript 타입 검사    |
| `yarn security:audit` | OSV 잠금 의존성 검사   |
| `yarn e2e:build:ios` | E2E용 iOS 앱 빌드       |
| `yarn e2e:ios`       | E2E 테스트 실행 (iOS)   |

---

## 📄 License

MIT License - see [LICENSE](LICENSE)

---

## 📮 Contact

- **GitHub**: [@kwakhyun](https://github.com/kwakhyun)
- **Email**: khyun9685@gmail.com
