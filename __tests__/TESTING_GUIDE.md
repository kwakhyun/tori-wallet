# Tori Wallet 테스트 가이드

이 문서는 현재 Jest와 React Native Testing Library 설정을 기준으로 테스트 작성 및 실행 방법을 설명합니다.

## 실행 명령

```bash
yarn test             # 변경 중 대화형 실행
yarn test:ci          # CI와 최종 확인용 단일 프로세스 실행
yarn test:coverage    # 전체 커버리지 측정
```

`jest.config.js`는 단위, 화면, 서비스, Realm, 통합 테스트를 모두 포함합니다. Detox E2E 테스트는 별도 `yarn e2e:*` 명령으로 실행합니다.

## React Native Testing Library 패턴

### 기본 구조

```tsx
import { fireEvent, render, screen } from '../test-utils';
import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('전송 동작을 실행한다', () => {
    const onSubmit = jest.fn();
    render(<MyComponent onSubmit={onSubmit} />);

    fireEvent.press(screen.getByRole('button', { name: '전송' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
```

### 쿼리 우선순위

사용자가 화면을 인식하고 조작하는 방식에 가까운 쿼리를 먼저 사용합니다.

1. `getByRole`과 접근 가능한 이름
2. `getByLabelText`
3. `getByPlaceholderText`
4. `getByText`
5. `getByDisplayValue`
6. 다른 방법으로 안정적으로 찾기 어려울 때 `getByTestId`

```tsx
// 권장: 역할과 접근 가능한 이름으로 동작을 표현
screen.getByRole('button', { name: '전송' });

// 권장: 입력 필드의 접근성 레이블 사용
screen.getByLabelText('받는 주소');

// 허용: 사용자에게 보이는 고유 텍스트
screen.getByText('1.5 ETH');

// 마지막 수단: 사용자 의미를 표현할 쿼리가 없는 내부 요소
screen.getByTestId('line-chart-canvas');

// 피하기: 스타일이나 구현 세부사항에 의존
screen.getByProps({ style: { color: 'red' } });
```

`testID`는 유용하지만 접근성 품질을 대신하지 않습니다. 버튼과 입력에는 적절한 `accessibilityRole`과 `accessibilityLabel`을 함께 제공합니다.

### 비동기 테스트

요소가 나타나는 시점을 기다릴 때는 `findBy*`를 우선 사용하고, 여러 단언이나 요소가 사라지는 조건에는 `waitFor`를 사용합니다.

```tsx
it('조회 결과를 표시한다', async () => {
  render(<SearchComponent />);

  fireEvent.changeText(screen.getByLabelText('코인 검색'), 'ethereum');

  expect(await screen.findByText('Ethereum')).toBeTruthy();
});

it('로딩 상태를 종료한다', async () => {
  render(<DataComponent />);

  await waitFor(() => {
    expect(screen.queryByText('불러오는 중')).toBeNull();
  });
});
```

### 서비스와 내비게이션 모킹

```tsx
jest.mock('@/services/walletService', () => ({
  walletService: {
    validateMnemonic: jest.fn().mockReturnValue(true),
    retrieveMnemonicWithPin: jest.fn().mockResolvedValue('test mnemonic'),
  },
}));
```

```tsx
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
  }),
}));
```

## MSW 통합 테스트

`__tests__/mocks/server.ts`는 MSW의 Node 서버를 실제로 시작하고, `__tests__/mocks/handlers.ts`의 기본 핸들러를 등록합니다. 통합 테스트도 일반 Jest 실행에 포함됩니다.

```tsx
import { http, HttpResponse } from 'msw';
import { server, setupMSW } from '../mocks/server';

describe('API integration', () => {
  setupMSW();

  it('서버 오류를 처리한다', async () => {
    server.use(
      http.get('*/api/v1/balance/:address', () =>
        HttpResponse.json({ error: 'Network error' }, { status: 500 }),
      ),
    );

    const response = await fetch('http://localhost:3000/api/v1/balance/0x123');

    expect(response.status).toBe(500);
  });
});
```

등록되지 않은 네트워크 요청은 `setupMSW()`에서 오류로 처리합니다. 테스트마다 `server.resetHandlers()`가 실행되므로 시나리오별 핸들러가 다른 테스트로 새지 않습니다.

## 스냅샷과 접근성

스냅샷은 넓은 화면 전체보다 변경 의도가 명확한 작은 컴포넌트에 사용합니다.

```tsx
it('정해진 마크업을 유지한다', () => {
  const { toJSON } = render(<Logo />);
  expect(toJSON()).toMatchSnapshot();
});
```

접근성 테스트는 속성 존재뿐 아니라 실제 사용자 쿼리가 성공하는지도 확인합니다.

```tsx
it('접근 가능한 전송 버튼을 제공한다', () => {
  render(
    <Pressable accessibilityRole="button" accessibilityLabel="전송">
      <Text>전송</Text>
    </Pressable>,
  );

  expect(screen.getByRole('button', { name: '전송' })).toBeTruthy();
});
```

## 커버리지 기준과 현재 상태

`jest.config.js`의 임계값은 회귀 방지를 위한 최소 기준입니다. 현재 수치는 2026년 8월 30일 `yarn test:coverage` 실행 결과입니다.

| 범위           | Statements | Branches | Functions |  Lines |
| -------------- | ---------: | -------: | --------: | -----: |
| 전역 최소 기준 |        53% |      38% |       48% |    53% |
| 전체 현재      |     60.85% |   49.04% |    55.41% | 61.38% |
| 서비스 현재    |     89.22% |   77.68% |    97.10% | 90.64% |
| 스토어 현재    |     93.62% |   77.36% |    95.12% | 93.50% |
| 유틸리티 현재  |     91.25% |   86.71% |    93.06% | 92.21% |

서비스와 스토어에는 전역보다 높은 별도 최소 기준이 적용됩니다. Statements와 Lines는 75%, Branches는 55%, Functions는 80%입니다.

같은 날짜 기준으로 91개 테스트 스위트, 1,339개 테스트와 스냅샷 2개가 통과했습니다.

## `testID` 네이밍

역할이나 레이블 쿼리로 표현하기 어려운 요소에만 다음 형식을 사용합니다.

```text
[screen/component]-[element]-[action/state]

home-balance-value
send-address-input
pin-confirm-keypad
error-boundary-retry-button
```

## 테스트 디렉터리

```text
__tests__/
├── app/              # 앱 루트
├── components/       # 공통 컴포넌트
├── config/           # QueryClient 등 설정
├── database/         # 로컬 DB 어댑터
├── hooks/            # React 훅
├── integration/      # MSW와 핵심 흐름 통합 테스트
├── mocks/            # MSW 핸들러와 서버
├── navigation/       # 내비게이션
├── realm/            # Realm 스키마, 서비스, 훅
├── screens/          # 화면
├── security/         # 보안 관련 회귀 테스트
├── services/         # 비즈니스 서비스
├── store/            # Zustand 스토어
├── utils/            # 유틸리티
└── test-utils.tsx    # 공통 렌더링 유틸리티
```
