# 2026-08 COLDCARD 시드 엔트로피 사건을 계기로 한 보안 검토

검토 기준일: 2026-08-14 (Asia/Seoul)

## 결론

2026년 8월 COLDCARD 보안 경고는 특정 하드웨어 지갑 펌웨어에서 생성된 시드의 엔트로피가 의도한 수준보다 낮아진 사건을 다룬다. 이 사건은 지갑이 오프라인이어도 생성 단계의 엔트로피가 부족하면 개인키가 예측될 수 있음을 보여준다. 토리월렛은 네트워크에 연결된 모바일 OS에서 키를 보관하고 서명하는 소프트웨어 핫월렛이므로 COLDCARD의 펌웨어·Secure Element·물리 장치 공격면은 직접 적용되지 않는다.

사건을 계기로 토리월렛의 시드 생성 신뢰 경계를 별도로 점검한 결과, 구형 Chrome 원격 디버깅 환경에서 난수 폴리필이 `Math.random`으로 폴백할 수 있는 개발용 경로를 확인했다. 이 경로는 일반 네이티브 운영 빌드가 아니라 `__DEV__` 원격 디버깅 환경에 한정되며, 실제 사용자 지갑이 영향을 받았다는 증거는 없다. 이번 변경으로 해당 환경, OS CSPRNG 부재·오류, 명백한 비정상 출력에서는 지갑 생성이 실패한다. 이는 토리월렛 고유의 위험을 차단한 것이며 COLDCARD와 구현 원인이 같다는 뜻이 아니다. 또한 외부 전문 감사나 과거에 생성된 모든 니모닉의 엔트로피를 소급 증명하지 않는다.

## 사건 요약

- Coinkite는 2026-07-30 경고를 게시하고 2026-08-01 갱신했다. Mk2/Mk3 펌웨어 4.0.1~4.1.9가 영향을 받았고, Mk4/Mk5/Q 일부 구버전도 의도한 128비트보다 낮은 약 72비트 수준의 시드를 만들 수 있었다.
- 고정 버전은 Mk2/Mk3 4.2.0+, Mk4/Mk5 Standard 5.6.0+, Q 1.5.0Q+, Edge 6.6.0X/QX+다. 펌웨어 업데이트만으로 기존 시드가 복구되지는 않으므로 새 시드로 자산을 이전해야 한다. 독립적으로 공정한 주사위를 50회 이상 사용한 경우는 공식 예외다.
- 2026-07-31 초기 보도는 약 594 BTC, 약 500개 지갑, 약 3,800만 달러를 추정했다. 2026-08-04 후속 보도는 Galaxy Research를 인용해 약 1,755 BTC, 약 5,000개 지갑, 약 1억 1,000만 달러까지 추정했다. 이는 빠르게 변한 체인 분석 추정치이며 공식 최종 피해액으로 보지 않는다.

2026-08-14 재확인 기준 Coinkite의 공식 경고는 2026-08-01 갱신본이 최신이었고, 신뢰할 수 있는 매체에서 확인된 가장 최근의 구체적 피해 추정은 2026-08-04 보도였다. 이후의 더 큰 수치는 1차 자료나 독립 검증이 부족해 결론에 사용하지 않았다. 공식 경고는 낮아진 엔트로피를 확인하지만 당시 상세 기술 검토는 진행 중이라고 밝혔으므로, 토리월렛의 원격 디버깅 폴백과 동일한 원인으로 단정하지 않는다.

출처: [Coinkite 공식 경고](https://blog.coinkite.com/coldcard-mk3-seed-generation-warning/), [COLDCARD 공식 펌웨어 안내](https://coldcard.com/docs/upgrade/), [Decrypt 초기 보도](https://decrypt.co/374766/38m-in-bitcoin-drained-by-coldcard-key-flaw-its-maker-thinks-ai-found), [Cinco Días 2026-08-04 후속 보도](https://cincodias.elpais.com/criptoactivos/2026-08-04/un-robo-de-60-millones-en-41-minutos-los-hackers-desvalijan-uno-de-los-lugares-mas-seguros-para-custodiar-criptomonedas.html)

## 토리월렛 적용성

| 사건에서 얻은 점검 기준 | 변경 전 토리월렛 | 이번 조치 | 현재 판단 |
| --- | --- | --- | --- |
| 시드 엔트로피 저하 | 네이티브 빌드는 iOS `SecRandomCopyBytes`/Android `SecureRandom`을 사용했지만, 구형 Chrome 원격 디버거의 개발용 폴리필은 별도 메커니즘으로 `Math.random`에 폴백할 수 있었음 | 원격 디버거 감지, CSPRNG 부재·오류, 단일 반복 바이트·반복 절반·직전 출력 재사용 시 지갑 생성을 즉시 중단 | 토리월렛 고유의 개발환경 폴백 차단. COLDCARD와 동일 원인으로 판단하지 않음 |
| 시드 생성 검증 | 라이브러리의 BIP-39 생성 경로에 의존 | OS 엔트로피를 직접 받아 BIP-39 니모닉으로 변환하고 체크섬 검증, 사용한 entropy 버퍼 0 처리 | 명백한 RNG 고장과 잘못된 니모닉 차단 |
| 기존 취약 시드 | 생성 당시 런타임을 사후 확인할 증적 없음 | 과거 개발·원격 디버깅 환경에서 만든 지갑은 새 지갑으로 이전 권고 | 소급 보증 불가 |
| 공급망/빌드 설정 | 자동 취약점 감시와 Action 버전 고정이 제한적 | GitHub Actions SHA 고정, Dependabot, CodeQL, dependency-review, OSV 주간 검사 | 탐지·재현성 강화 |
| 물리 장치/펌웨어 | 소프트웨어 지갑이라 COLDCARD 펌웨어와 무관 | 해당 없음 | 직접 적용되지 않음 |

상태 검사는 명백한 고장 탐지 장치이지 엔트로피를 통계적으로 증명하는 장치가 아니다. 최종 신뢰의 뿌리는 모바일 OS의 CSPRNG와 앱 바이너리·OS 무결성이다.

## 별도 모바일 핫월렛 위협 모델에 따른 개선

다음 항목은 COLDCARD 펌웨어 사건의 직접 대응이 아니라, 같은 검토 주기에 별도의 모바일 핫월렛 위협 모델을 적용해 수행한 보안 강화다.

1. 서명 요청을 전체 주소·원시 수량·calldata/EIP-712 원문으로 표시하고, 무제한 ERC-20 승인·NFT 전체 승인·읽을 수 없는 서명을 경고한다.
2. 검토한 요청을 keccak256 지문으로 바인딩하고 서명 직전 다시 분석해 TOCTOU 변경을 차단한다.
3. 0x Swap API v2 견적의 토큰·수량·taker·AllowanceHolder·실행 대상·최소 수령량·잔액·시뮬레이션 결과와 90초 유효기간을 검증한다. Settler에는 직접 승인하지 않는다.
4. WalletConnect Verify가 `INVALID` 또는 사기로 판정한 출처, 만료 요청, 승인한 세션의 계정·체인·메서드 범위를 벗어난 요청을 거부한다.
5. 온보딩 니모닉은 navigation params나 클립보드 대신 메모리 전용 10분 세션에 두고 백그라운드 전환·완료·취소 시 삭제한다.
6. QR 스캔에 불필요한 VisionCamera 위치 기능을 iOS 빌드에서 제외했다.

0x 정책 근거: [Swap API v2 업그레이드](https://docs.0x.org/docs/upgrading/upgrading-to-swap-v2), [0x 컨트랙트 안내](https://docs.0x.org/docs/core-concepts/contracts). WalletConnect 정책 근거: [React Native WalletKit 마이그레이션](https://docs.walletconnect.network/wallet-sdk/upgrade/from-web3wallet-react-native), [Verify API](https://docs.walletconnect.network/wallet-sdk/react-native/verify).

## 검증 결과

- TypeScript 타입 검사와 ESLint 통과
- Jest 88개 스위트, 1,292개 테스트, 커버리지 게이트 통과
- OSV: 잠금 npm 패키지 1,229개, 조치 대상 알려진 취약점 0개
- Android Debug APK 빌드 통과
- iOS arm64 Simulator Debug 빌드 통과

`image-size@1.2.1`의 2026-08 DoS 취약점 2건은 업스트림 수정 릴리스가 없어 로컬 패치와 악성 JXL/ICNS 종료 회귀 테스트로 완화했다. OSV 예외는 2026-10-01에 자동 만료되며, 그 전 업스트림 수정 버전으로 교체해야 한다.

## 잔여 위험과 운영 권고

- 이번 결과는 코드 검토와 자동 검증이다. 공개 배포 전 독립 모바일·암호화·Web3 전문 감사를 수행한다.
- 2026-08 개선 전, 특히 Chrome 원격 디버깅 또는 출처가 불확실한 개발 빌드에서 생성한 니모닉은 안전성을 증명할 수 없다. 새 코드로 새 지갑을 생성하고 온체인에서 자산을 이전한다.
- 루팅·탈옥, 악성 접근성 서비스, 화면 오버레이, 변조된 OS/앱은 소프트웨어 지갑의 신뢰 경계를 무너뜨릴 수 있다. 고액 장기 보관에는 별도 화면과 물리 확인이 가능한 검증된 하드웨어 지갑을 사용한다.
- 0x/RPC 응답은 로컬에서 구조와 의도를 검증하지만 외부 응답 자체가 암호학적으로 신뢰되는 것은 아니다. 운영 프록시 접근 제어, 레이트 리밋, 로그·알림과 다중 RPC 교차 검증을 추가한다.
- E2E 테스트는 이번 변경에서 재실행하지 않았다. 실제 기기에서 생성·복구·백그라운드 잠금·WalletConnect 피싱 경고·스왑 승인/취소 흐름을 출시 전 확인한다.
