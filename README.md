# Tori Wallet 🦊

[![React Native](https://img.shields.io/badge/React%20Native-0.83-61DAFB?logo=react)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Viem](https://img.shields.io/badge/Viem-2.55-646CFF)](https://viem.sh/)
[![Tests](https://img.shields.io/badge/Tests-1339%20passed-brightgreen)](/)
[![Coverage](https://img.shields.io/badge/Services-89.22%25-brightgreen)](/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **React Native + TypeScript 기반 셀프 커스터디 Web3 모바일 핫월렛**
> 멀티체인, Reown WalletKit 기반 WalletConnect v2, 0x Swap API v2 연동을 지원하는 소프트웨어 지갑

> 토리월렛은 네트워크에 연결된 모바일 OS에서 키를 보관하고 서명하는 소프트웨어 핫월렛입니다. 키를 서버로 전송하지 않지만, 실행 중인 모바일 OS와 앱의 무결성을 보안 경계로 신뢰합니다. 하드웨어 콜드월렛이 아니며, 외부 전문 보안 감사를 완료했다는 의미도 아닙니다.

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

| 변수                       | 필수 | 용도                         | 발급처                                                 |
| -------------------------- | :--: | ---------------------------- | ------------------------------------------------------ |
| `WALLETCONNECT_PROJECT_ID` |  ⚠️  | dApp 연결                    | [WalletConnect Cloud](https://cloud.walletconnect.com) |
| `SWAP_API_BASE_URL`        | 운영 | 0x 키를 보관하는 스왑 프록시 | 자체 백엔드                                            |

> ⚠️ 모바일 앱의 환경 변수는 비밀이 아닙니다. 0x API 키는 반드시 서버에만 보관하세요. 개발 빌드는 키 없이 0x를 직접 호출하며, 운영 빌드는 `SWAP_API_BASE_URL`이 없으면 스왑을 비활성화합니다.

> RPC와 시세 조회는 현재 코드에 정의된 공개 엔드포인트를 사용합니다. 별도 RPC 또는 CoinGecko API 키 설정은 아직 지원하지 않습니다.

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
- 거래 영수증에 기반한 상태 추적과 앱 재실행 후 대기 거래 복구
- ERC-20 전송은 선택한 계약에 `transfer`를 호출하고 네이티브 전송액은 0으로 고정합니다. 수량 계산에는 정수 단위를 사용하며, 토큰 잔액과 네이티브 수수료 잔액을 각각 확인합니다.

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
│  └── React Query: 서버 상태 (잔액, 토큰, TX)                 │
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
│   ├── schemas/      # 스키마 정의 (8개)
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
| **보안 저장소**   | EncryptedStorage + react-native-keychain  |
| **테스트**        | Jest, React Testing Library, Detox        |
| **패키지 매니저** | Yarn                                      |

### 💡 기술 선택 이유

| 기술            | 선택 이유                                                       |
| --------------- | --------------------------------------------------------------- |
| **Viem**        | 타입 안전한 체인 API와 필요한 함수 단위의 모듈 임포트 지원      |
| **Zustand**     | 작은 상태 모델과 선택 구독으로 화면별 의존 상태를 명확하게 관리 |
| **React Query** | 서버 상태 캐싱, 재시도, 네트워크와 앱 포커스 상태 연동          |
| **Realm**       | React Native 로컬 객체 DB, 최근 데이터 캐시와 반응형 조회 지원  |

---

## 🛡️ 안정성 설계

> 사용자 자산을 다루는 서비스 특성상 작은 실수도 치명적임을 인지하고, 안정성을 최우선으로 설계

### 보안

- **Fail-closed 키 생성**: iOS `SecRandomCopyBytes` / Android `SecureRandom` 기반 OS CSPRNG만 허용하고, 구형 Chrome 원격 디버거의 `Math.random` 폴백·반복/비정상 출력을 차단
- **니모닉 노출 최소화**: 온보딩 중 메모리 전용 10분 세션에만 보관하며 백그라운드 전환, 완료, 취소 시 제거. 백업 문구의 클립보드 복사 미지원
- **암호화 볼트**: scrypt 키 분리 + AES-256-CBC + HMAC-SHA256(Encrypt-then-MAC), 생체인증 자격 증명은 기기 전용 Keychain/Keystore 정책 적용
- **서명 승인**: 계정, 대상 주소, 수량, 원문과 수수료를 표시합니다. 승인한 요청 사본을 PIN 인증에 연결하고, 나중에 도착한 요청은 별도 검토를 기다립니다. 서명 직전에 요청 지문, 계정, 세션 권한과 만료 시각을 다시 확인합니다.
- **PIN 제한**: 실패 횟수를 암호화 저장소에 기록합니다. 5번째 실패부터 30초 대기, 이후 실패마다 두 배씩 늘려 최대 1시간을 적용합니다. 앱 재실행이나 화면 변경으로 제한이 초기화되지 않습니다.
- **PIN 처리 중 응답성**: scrypt 강도와 볼트 형식을 유지하며 계산 사이에 입력과 앱 상태 변경을 처리합니다. 느린 기기에서도 PIN 실패 후 정해진 대기 시간이 온전히 적용됩니다.
- **인증 취소**: 취소, 화면 종료, 백그라운드 전환 뒤 도착한 인증 결과는 폐기합니다. 지갑이 잠긴 뒤에는 이미 얻은 계정 객체로도 서명할 수 없습니다.
- **스왑 무결성**: 0x v2 응답의 intent/quote 지문, AllowanceHolder, 실행 대상, 잔액·시뮬레이션·최소 수령량을 검증
- **피싱 방어**: WalletConnect Verify의 `INVALID`/사기 출처와 만료·세션 범위 밖 요청 자동 거부
- **앱 생명주기**: 백그라운드 전환 시 진행 중 인증과 온보딩을 취소합니다. 서명 세션은 사용자가 설정한 자동 잠금 정책에 따라 폐기합니다.
- **공급망 검사**: 해시 고정 GitHub Actions, Dependabot, CodeQL, dependency-review, 주간 OSV 검사

2026년 8월 COLDCARD 시드 엔트로피 사건과 토리월렛의 제한적인 적용성은 [보안 검토 보고서](docs/SECURITY_REVIEW_2026-08.md)에 기록했습니다. COLDCARD의 하드웨어·펌웨어 결함은 토리월렛에 직접 적용되지 않습니다. 다만 사건을 계기로 시드 생성 신뢰 경계를 점검해, 구형 Chrome 원격 디버깅 환경에 존재하던 토리월렛 고유의 비보안 RNG 폴백 경로를 차단했습니다. 두 문제의 구현 원인이 동일하다는 의미는 아니며, 외부 전문 감사나 기존 지갑 엔트로피의 소급 증명을 대신하지도 않습니다.

### API 오류·지연 등 예외 상황 대응

| 상황              | 대응 전략                                 |
| ----------------- | ----------------------------------------- |
| **네트워크 오류** | React Query 지수 백오프 재시도 (최대 3회) |
| **RPC 지연**      | 주요 화면 로딩 상태 + RPC 30초 타임아웃   |
| **오프라인**      | 거래 화면의 최근 Realm 캐시 표시          |
| **시세 제한**     | 요청 간격 제어 + CoinCap 대체 경로        |
| **거래 확인 지연** | RPC 오류와 시간 초과는 대기 상태를 유지하고, 앱 재실행과 네트워크 복구 시 다시 조회합니다. 체인 영수증이 되돌림을 확인한 경우에만 실패로 기록합니다. |

### 에러 처리

- **ErrorBoundary**: 컴포넌트 레벨 크래시 방지, 복구 화면 제공
- **체계적인 에러 코드**: 사용자 친화적 한국어 메시지
- **에러 로깅**: 디버깅을 위한 상세 로그 기록

### 로컬 캐시 범위와 제한

- 거래 내역: API 결과를 Realm에 저장하고 조회 실패 또는 빈 응답 시 최근 캐시 표시
- 주소록, WalletConnect 기록, 사용자 설정: Realm 기반 로컬 조회 지원
- 전송과 스왑: 제출한 거래를 로컬에 기록하고 앱이 실행 중인 동안 영수증 결과를 반영
- 현재 잔액과 토큰 가격은 네트워크 조회가 필요합니다. `BalanceSnapshot`과 `TokenList` 저장 API는 있지만 화면의 오프라인 대체 데이터로 연결되어 있지 않습니다.

---

## ⚡ 성능 최적화

| 최적화 기법         | 적용 범위                         | 효과                             |
| ------------------- | --------------------------------- | -------------------------------- |
| Zustand 선택 구독   | 19개 화면, 컴포넌트, 공용 훅      | 무관한 상태 변경의 리렌더링 차단 |
| useCallback/useMemo | 목록 렌더러와 비용이 큰 계산      | 참조 안정화와 계산 중복 감소     |
| FlatList 가상화     | 리스트 화면 6개                   | 화면 밖 항목 렌더링 비용 절감    |
| React Query 캐싱    | 잔액, 토큰, 거래, 포트폴리오 조회 | 중복 네트워크 요청 감소          |
| Realm 캐싱          | 6개 로컬 데이터 서비스            | 오프라인 조회 지원               |
| 지수 백오프 재시도  | 재시도 가능한 쿼리와 뮤테이션     | 일시적 네트워크 오류 대응        |

---

## 🧪 테스트

```bash
yarn test              # 단위/통합 테스트
yarn test:coverage     # 커버리지 리포트
yarn test:ios:config  # iOS 최소 지원 버전 설정 회귀 검사
yarn e2e:build:ios     # E2E용 iOS 앱 빌드
yarn e2e:ios           # E2E 테스트 (iOS)
yarn e2e:build:android # E2E용 Android 앱 빌드
yarn e2e:android       # E2E 테스트 (Android)
```

iOS와 Android E2E는 테스트용 지갑을 가져온 뒤 재시작 잠금, 잘못된 PIN 거부,
올바른 PIN 해제와 잘못된 수신 주소 차단을 확인합니다. 공개된
테스트 복구 구문을 사용하며 트랜잭션을 전파하지 않습니다.
`DETOX_ANDROID_AVD`로 설치된 AVD 이름을 지정하거나, 실행 중인 테스트
기기에 `yarn detox test -c android.att.e2e`로 연결할 수 있습니다.
Android E2E 빌드는 개발용 경고 UI를 포함하지 않는 번들을 앱에 내장합니다.
별도 앱 ID(`com.toriwallet.e2e`)와 디버그 서명을 사용하므로 Metro 서버나
배포용 서명 키가 필요하지 않습니다.
실제 scrypt 계산을 여러 번 실행하므로 에뮬레이터에서는 수 분이 걸릴 수
있습니다. PIN 처리 대기와 전체 테스트 제한은 이를 반영합니다.

iOS는 Xcode와 설치된 iOS Simulator 런타임, CocoaPods, `applesimutils`가
필요합니다. `yarn pod:install` 후 `yarn e2e:build:ios`를 실행하면
JavaScript 번들이 내장된 Release 앱을 별도 앱 ID(`com.toriwallet.e2e`)로
빌드합니다. 시뮬레이터의 Keychain 접근에 필요한 앱 식별자 권한을
유지하도록 ad hoc 서명을 적용합니다. Metro 서버와 배포용 인증서는
필요하지 않습니다.
`yarn e2e:ios`는 설치된 호환 런타임 중 최신 버전으로 임시 iPhone 15 Pro를
생성하고 부팅한 뒤 테스트하며, 완료되거나 실패하면 해당 기기를 삭제합니다.
`DETOX_IOS_DEVICE`로 기종을, `DETOX_IOS_RUNTIME`으로 설치된 런타임 버전
(예: `18.4`)을 선택할 수 있습니다. 테스트마다 Keychain을 초기화하므로
이 명령이 생성한 임시 기기에서만 실행하도록 검사합니다. 기존 개인
시뮬레이터는 사용하지 않습니다.
Pods 설치 시 리소스 번들의 오래된 최소 iOS 버전도 앱의 최소 지원 버전인
iOS 15.1 이상으로 맞춥니다. 이 보정은 `yarn test:ios:config`로 검사하며,
`yarn e2e:build:ios`에서도 빌드 전에 실행합니다.
iOS 27 SDK의 [UIScene 생명주기 요구사항](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle)에
맞춰 `SceneDelegate`가 화면을 생성하고, 비활성 상태의 개인정보 가림막과
복귀 시 해제를 처리합니다. 첫 실행과 백그라운드 복귀는 온보딩 E2E에
포함되어 있습니다.
복구 구문과 전송 입력 화면은 iOS 키보드 높이에 맞춰 스크롤 영역을
조정합니다. E2E에서도 키보드를 닫고 가려진 입력란으로 스크롤해
실제 입력과 버튼 동작을 확인합니다.

회귀 테스트에는 PIN 인증 취소와 앱 종료, 영구 시도 제한, WalletConnect
요청 교체와 수수료 변경, 토큰 소수점 정밀도, RPC 오류 후 거래 상태 복구,
계정별 포트폴리오 분리와 지갑 초기화 중 저장 경합을 포함합니다.
지갑 삭제는 PIN 검증과 같은 대기열에서 처리하며, 구형 암호화 형식의
변환이 늦게 끝나도 삭제한 복구 구문이 다시 저장되지 않는지 검사합니다.
Android 실행 중 발견한 Realm 패키지와 앱 폴더의 이름 충돌도 Babel 변환
회귀 테스트로 검사합니다.
`@noble/hashes`의 작업 양보 패치는 CommonJS, ESM과 TypeScript 소스에
동일하게 적용하며, 실제 키 파생 중 호스트 이벤트 처리와 느린 타이머의
대기 시간이 다음 계산 구간에 누적되지 않는지 검사합니다.

### 테스트 현황

| 항목              | 검증 결과                              | 기준일     |
| ----------------- | -------------------------------------- | ---------- |
| **테스트 스위트** | 단위, 통합 테스트 99개 통과 | 2026-10-22 |
| **테스트 케이스** | 1,363개와 스냅샷 2개 통과 | 2026-10-22 |
| **iOS 빌드 설정 회귀 검사** | Ruby 테스트 4개 통과, Pods 빌드 설정 204개 확인 | 2026-10-22 |
| **정적 검사** | TypeScript, ESLint 통과 | 2026-10-22 |
| **의존성 검사** | OSV 1,229개 잠금 패키지, 미조치 0개, 검증된 예외 8개 | 2026-10-22 |
| **Android 빌드** | Debug, E2E 앱과 테스트 APK 통과 (arm64-v8a) | 2026-10-22 |
| **JavaScript 번들** | Android 개발용, 릴리스용 번들 생성 통과 | 2026-10-22 |
| **iOS 빌드** | Xcode 27.1, Release 시뮬레이터 앱 통과 (arm64, x86_64) | 2026-10-22 |
| **iOS E2E 테스트** | iOS 27.0, iPhone 15 Pro에서 온보딩과 복귀 4개, 잠금 1개, 전송 입력 검증 1개 통과 | 2026-10-22 |
| **Android E2E 테스트** | API 36 에뮬레이터에서 잠금, 송금 입력 검증 2개 통과 | 2026-10-22 |

> 2026-10-22에 의존성을 다시 점검했습니다. 호환 범위 내 수정 버전으로 갱신했고, 교체 시 모듈 형식이 바뀌거나 수정 버전이 없는 항목은 `patches/`의 보안 패치로 관리합니다. 8개 OSV 항목 중 7개는 패치 회귀 테스트로 완화를 검증하며, 1개는 구버전에 취약한 JSONC 진입점이 존재하지 않음을 검사합니다. `osv-scanner.toml`에는 정확한 패키지 버전, 패치 SHA-256, 검토 사유와 만료일(2027-01-20)을 기록했습니다. `yarn security:audit`는 설치된 패치의 회귀 검사와 해시 확인을 먼저 실행하며, 버전이나 패치가 달라지면 예외를 적용하지 않습니다.

### 커버리지 요약

아래 수치는 기존 측정 결과입니다. 이번 변경에서는 전체 테스트를 다시
실행했으며 커버리지 비율은 재측정하지 않았습니다.

| 레이어     | Statements | Branches | Functions | Lines  |
| ---------- | ---------- | -------- | --------- | ------ |
| **전체**   | 60.85%     | 49.04%   | 55.41%    | 61.38% |
| **서비스** | 89.22%     | 77.68%   | 97.10%    | 90.64% |
| **스토어** | 93.62%     | 77.36%   | 95.12%    | 93.50% |
| **유틸**   | 91.25%     | 86.71%   | 93.06%    | 92.21% |

---

## 🔧 환경 변수

```bash
cp .env.example .env
```

```env
WALLETCONNECT_PROJECT_ID=your_project_id
SWAP_API_BASE_URL=https://your-swap-proxy.example
```

> 운영 빌드에서 `SWAP_API_BASE_URL`은 필수이며 0x API 키는 프록시 서버에만 저장합니다.

---

## 📝 스크립트

| Script                | Description                |
| --------------------- | -------------------------- |
| `yarn start`          | Metro 개발 서버            |
| `yarn ios`            | iOS 시뮬레이터 실행        |
| `yarn android`        | Android 에뮬레이터 실행    |
| `yarn test`           | Jest 테스트                |
| `yarn test:ci`        | 단위·통합 테스트 일괄 실행 |
| `yarn test:coverage`  | 커버리지 리포트            |
| `yarn lint`           | ESLint 검사                |
| `yarn typecheck`      | TypeScript 타입 검사       |
| `yarn security:audit` | OSV 잠금 의존성 검사       |
| `yarn e2e:build:ios`  | E2E용 iOS 앱 빌드          |
| `yarn e2e:ios`        | E2E 테스트 실행 (iOS)      |

---

## 📄 License

MIT License - see [LICENSE](LICENSE)

---

## 📮 Contact

- **GitHub**: [@kwakhyun](https://github.com/kwakhyun)
- **Email**: khyun9685@gmail.com
