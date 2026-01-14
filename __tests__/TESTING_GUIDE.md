# Tori Wallet 테스트 가이드

## 최신 React Native Testing Library 패턴

### 1. 기본 테스트 구조

```tsx
import { render, screen, fireEvent, waitFor } from '../test-utils';
import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  // 테스트 전 설정
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    render(<MyComponent />);

    // screen 객체 사용 권장 (최신 패턴)
    expect(screen.getByTestId('my-component')).toBeTruthy();
  });
});
```

### 2. 권장 쿼리 우선순위

1. **getByTestId** - 테스트 안정성 최고
2. **getByText** - 사용자에게 보이는 텍스트
3. **getByRole** - 접근성 기반 (버튼, 링크 등)
4. **getByPlaceholderText** - 입력 필드

```tsx
// ✅ 권장: testID 사용
screen.getByTestId('submit-button');

// ✅ 권장: 사용자에게 보이는 텍스트
screen.getByText('전송');

// ⚠️ 피하기: 구현 세부사항에 의존
screen.getByProps({ style: { color: 'red' } });
```

### 3. 비동기 테스트 패턴

```tsx
// waitFor 사용
it('should load data', async () => {
  render(<DataComponent />);

  // 로딩 상태 확인
  expect(screen.getByTestId('loading')).toBeTruthy();

  // 데이터 로드 대기
  await waitFor(() => {
    expect(screen.getByTestId('data-content')).toBeTruthy();
  });
});

// findBy 사용 (waitFor + getBy 조합)
it('should show result', async () => {
  render(<SearchComponent />);

  fireEvent.press(screen.getByTestId('search-button'));

  // findBy는 자동으로 대기함
  const result = await screen.findByTestId('search-result');
  expect(result).toBeTruthy();
});
```

### 4. 사용자 이벤트 시뮬레이션

```tsx
import { fireEvent, render, screen } from '../test-utils';

it('should handle button press', () => {
  const onPress = jest.fn();
  render(<Button onPress={onPress} testID="my-button" />);

  fireEvent.press(screen.getByTestId('my-button'));

  expect(onPress).toHaveBeenCalledTimes(1);
});

it('should handle text input', () => {
  render(<TextInput testID="my-input" />);

  fireEvent.changeText(screen.getByTestId('my-input'), 'Hello');

  expect(screen.getByTestId('my-input').props.value).toBe('Hello');
});
```

### 5. Mock 패턴

#### 서비스 모킹

```tsx
jest.mock('@/services/walletService', () => ({
  walletService: {
    getBalance: jest.fn().mockResolvedValue('1.5'),
    sendTransaction: jest.fn().mockResolvedValue({ hash: '0x123' }),
  },
}));
```

#### Navigation 모킹

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

### 6. MSW를 사용한 API 모킹

```tsx
import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';

describe('API Integration', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('should fetch balance', async () => {
    render(<BalanceComponent />);

    await waitFor(() => {
      expect(screen.getByText('1.5 ETH')).toBeTruthy();
    });
  });

  it('should handle API error', async () => {
    // 에러 시나리오 오버라이드
    server.use(
      http.get('*/api/balance', () =>
        HttpResponse.json({ error: 'Network error' }, { status: 500 }),
      ),
    );

    render(<BalanceComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeTruthy();
    });
  });
});
```

### 7. 스냅샷 테스트

```tsx
it('should match snapshot', () => {
  const { toJSON } = render(<MyComponent />);
  expect(toJSON()).toMatchSnapshot();
});
```

### 8. 접근성 테스트

```tsx
it('should be accessible', () => {
  render(<Button title="Submit" testID="submit-button" />);

  const button = screen.getByTestId('submit-button');

  // 접근성 레이블 확인
  expect(button.props.accessibilityLabel).toBeDefined();
  expect(button.props.accessibilityRole).toBe('button');
});
```

### 9. 커버리지 목표

| 지표       | 목표 | 현재 |
| ---------- | ---- | ---- |
| Statements | 80%  | -    |
| Branches   | 70%  | -    |
| Functions  | 75%  | -    |
| Lines      | 80%  | -    |

### 10. testID 네이밍 컨벤션

```
[screen/component]-[element]-[action/state]

예시:
- home-screen
- home-balance-value
- home-send-button
- send-address-input
- send-amount-input
- pin-confirm-keypad
- error-boundary-retry-button
```

## 파일 구조

```
__tests__/
├── mocks/
│   ├── handlers.ts      # MSW 핸들러
│   └── server.ts        # MSW 서버 설정
├── screens/
│   └── HomeScreen.test.tsx
├── components/
│   └── Button.test.tsx
├── hooks/
│   └── useBalance.test.tsx
├── integration/
│   ├── apiMocking.test.ts
│   └── errorHandling.test.tsx
├── store/
│   └── walletStore.test.ts
└── test-utils.tsx       # 테스트 유틸리티
```
