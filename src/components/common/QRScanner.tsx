/**
 * QR 코드 스캔 컴포넌트
 *
 * 스캔 결과를 parseScannedCode로 해석해 전달한다. EIP-681 토큰 요청의
 * 수신자/수량/체인을 보존하고, 허용되지 않는 QR은 스캐너를 닫지 않고
 * 화면 안에서 안내한 뒤 다시 스캔할 수 있게 한다.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components/native';
import { Linking, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import { palette } from '@/styles/theme';
import { useWalletLocked } from '@/hooks/useWalletLocked';
import { AppModal } from './AppModal';
import { errorFeedback, successFeedback } from '@/utils/haptics';
import {
  parseScannedCode,
  isAcceptedForMode,
  type ScanMode,
  type ScanResult,
} from '@/utils/paymentUri';

interface Props {
  visible: boolean;
  onClose: () => void;
  onScan: (result: ScanResult) => void;
  title?: string;
  /** 'address': 주소/결제 요청, 'walletconnect': wc: URI, 'any': 모두 */
  mode?: ScanMode;
  hint?: string;
}

const MODE_ERROR: Record<ScanMode, string> = {
  address: '지갑 주소나 결제 요청 QR이 아닙니다.',
  walletconnect:
    'WalletConnect 연결 QR이 아닙니다. dApp의 연결 QR을 스캔해주세요.',
  any: '인식할 수 없는 QR 코드입니다.',
};

const MODE_HINT: Record<ScanMode, string> = {
  address: '지갑 주소 또는 결제 요청 QR 코드를 스캔하세요',
  walletconnect: 'dApp 화면의 WalletConnect QR 코드를 스캔하세요',
  any: 'QR 코드를 스캔하세요',
};

type PermissionState = 'unknown' | 'requesting' | 'denied';

export function QRScanner({
  visible,
  onClose,
  onScan,
  title = 'QR 코드 스캔',
  mode = 'address',
  hint,
}: Props) {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const insets = useSafeAreaInsets();
  // 잠긴 동안에는 모달이 숨겨지므로 카메라도 끈다.
  const locked = useWalletLocked();
  const [isActive, setIsActive] = useState(false);
  const [torch, setTorch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] =
    useState<PermissionState>('unknown');
  const handledRef = useRef(false);
  const lastRejectedRef = useRef<string | null>(null);

  const askPermission = useCallback(async () => {
    setPermissionState('requesting');
    const granted = await requestPermission();
    // 사용자가 영구 거부한 경우 requestPermission은 즉시 false를 반환한다.
    setPermissionState(granted ? 'unknown' : 'denied');
  }, [requestPermission]);

  useEffect(() => {
    if (visible && !hasPermission && permissionState === 'unknown') {
      askPermission();
    }
  }, [visible, hasPermission, permissionState, askPermission]);

  useEffect(() => {
    if (visible && hasPermission) {
      setIsActive(true);
      handledRef.current = false;
      lastRejectedRef.current = null;
      setError(null);
    } else {
      setIsActive(false);
      setTorch(false);
    }
    if (!visible) setPermissionState('unknown');
  }, [visible, hasPermission]);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      if (handledRef.current) return;
      const value = codes.find(code => code.type === 'qr')?.value;
      if (!value || value === lastRejectedRef.current) return;

      const result = parseScannedCode(value);
      if (!isAcceptedForMode(result, mode)) {
        lastRejectedRef.current = value;
        errorFeedback();
        setError(result.kind === 'invalid' ? result.reason : MODE_ERROR[mode]);
        return;
      }

      handledRef.current = true;
      successFeedback();
      setIsActive(false);
      onScan(result);
      onClose();
    },
  });

  const handleClose = useCallback(() => {
    setIsActive(false);
    onClose();
  }, [onClose]);

  const renderPermission = () => (
    <PermissionContainer testID="qr-scanner-permission-container">
      <PermissionIcon importantForAccessibility="no">📷</PermissionIcon>
      <PermissionText>
        {permissionState === 'denied'
          ? '카메라 권한이 거부되어 있습니다.\n설정에서 카메라 접근을 허용해주세요.'
          : 'QR 코드를 스캔하려면 카메라 권한이 필요합니다.'}
      </PermissionText>
      <PermissionButton
        onPress={() =>
          permissionState === 'denied'
            ? Linking.openSettings()
            : askPermission()
        }
        accessibilityRole="button"
        testID="qr-scanner-permission-button"
      >
        <PermissionButtonText>
          {permissionState === 'denied' ? '설정 열기' : '권한 요청'}
        </PermissionButtonText>
      </PermissionButton>
    </PermissionContainer>
  );

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      onLock={handleClose}
    >
      <Container testID="qr-scanner-container">
        <Header style={{ paddingTop: insets.top + 8 }}>
          <CloseButton
            onPress={handleClose}
            testID="qr-scanner-close"
            accessibilityRole="button"
            accessibilityLabel="스캐너 닫기"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <CloseButtonText importantForAccessibility="no">✕</CloseButtonText>
          </CloseButton>
          <HeaderTitle testID="qr-scanner-title" accessibilityRole="header">
            {title}
          </HeaderTitle>
          {hasPermission && device?.hasTorch ? (
            <CloseButton
              onPress={() => setTorch(value => !value)}
              accessibilityRole="switch"
              accessibilityLabel="손전등"
              accessibilityState={{ checked: torch }}
              testID="qr-scanner-torch"
            >
              <CloseButtonText importantForAccessibility="no">
                {torch ? '🔦' : '💡'}
              </CloseButtonText>
            </CloseButton>
          ) : (
            <Placeholder />
          )}
        </Header>

        <CameraContainer testID="qr-scanner-camera-container">
          {!hasPermission ? (
            renderPermission()
          ) : !device ? (
            <LoadingContainer testID="qr-scanner-loading">
              <ActivityIndicator size="large" color={palette.indigo[500]} />
              <LoadingText>카메라 준비 중...</LoadingText>
            </LoadingContainer>
          ) : (
            <>
              <StyledCamera
                device={device}
                isActive={isActive && !locked}
                codeScanner={codeScanner}
                torch={torch ? 'on' : 'off'}
              />
              <ScanOverlay pointerEvents="box-none">
                <OverlayTop />
                <MiddleRow>
                  <OverlaySide />
                  <ScanFrame $error={!!error}>
                    <CornerTL />
                    <CornerTR />
                    <CornerBL />
                    <CornerBR />
                  </ScanFrame>
                  <OverlaySide />
                </MiddleRow>
                <OverlayBottom>
                  {error ? (
                    <ErrorBox
                      accessibilityRole="alert"
                      accessibilityLiveRegion="assertive"
                      testID="qr-scanner-error"
                    >
                      <ErrorText>{error}</ErrorText>
                      <RetryLink
                        onPress={() => {
                          setError(null);
                          lastRejectedRef.current = null;
                        }}
                        accessibilityRole="button"
                        testID="qr-scanner-retry"
                      >
                        <RetryLinkText>다시 스캔</RetryLinkText>
                      </RetryLink>
                    </ErrorBox>
                  ) : (
                    <ScanHintText>
                      QR 코드를 프레임 안에 맞춰주세요
                    </ScanHintText>
                  )}
                </OverlayBottom>
              </ScanOverlay>
            </>
          )}
        </CameraContainer>

        <Footer style={{ paddingBottom: insets.bottom + 16 }}>
          <FooterText>{hint ?? MODE_HINT[mode]}</FooterText>
        </Footer>
      </Container>
    </AppModal>
  );
}

const Container = styled.View`
  flex: 1;
  background-color: ${palette.black};
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md}px;
  background-color: rgba(0, 0, 0, 0.8);
`;

const CloseButton = styled.TouchableOpacity`
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background-color: rgba(255, 255, 255, 0.2);
  align-items: center;
  justify-content: center;
`;

const CloseButtonText = styled.Text`
  color: ${palette.white};
  font-size: 18px;
  font-weight: 600;
`;

const HeaderTitle = styled.Text`
  color: ${palette.white};
  font-size: 18px;
  font-weight: 600;
`;

const Placeholder = styled.View`
  width: 40px;
`;

const CameraContainer = styled.View`
  flex: 1;
  position: relative;
`;

const StyledCamera = styled(Camera)`
  flex: 1;
`;

const PermissionContainer = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  background-color: #18181b;
`;

const PermissionIcon = styled.Text`
  font-size: 64px;
  margin-bottom: 16px;
`;

const PermissionText = styled.Text`
  color: #fff;
  font-size: 16px;
  margin-bottom: 24px;
`;

const PermissionButton = styled.TouchableOpacity`
  background-color: #6366f1;
  padding: 12px 24px;
  border-radius: 12px;
`;

const PermissionButtonText = styled.Text`
  color: #fff;
  font-size: 16px;
  font-weight: 600;
`;

const LoadingContainer = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  background-color: #18181b;
`;

const LoadingText = styled.Text`
  color: #a1a1aa;
  font-size: 14px;
  margin-top: 16px;
`;

// 스캔 오버레이
const ScanOverlay = styled.View`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
`;

const OverlayTop = styled.View`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.6);
`;

const MiddleRow = styled.View`
  flex-direction: row;
`;

const OverlaySide = styled.View`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.6);
`;

const ScanFrame = styled.View<{ $error?: boolean }>`
  width: 250px;
  height: 250px;
  position: relative;
  border-width: ${({ $error }) => ($error ? 2 : 0)}px;
  border-color: ${palette.red[500]};
`;

const CornerBase = styled.View`
  position: absolute;
  width: 30px;
  height: 30px;
  border-color: #6366f1;
`;

const CornerTL = styled(CornerBase)`
  top: 0;
  left: 0;
  border-top-width: 4px;
  border-left-width: 4px;
  border-top-left-radius: 12px;
`;

const CornerTR = styled(CornerBase)`
  top: 0;
  right: 0;
  border-top-width: 4px;
  border-right-width: 4px;
  border-top-right-radius: 12px;
`;

const CornerBL = styled(CornerBase)`
  bottom: 0;
  left: 0;
  border-bottom-width: 4px;
  border-left-width: 4px;
  border-bottom-left-radius: 12px;
`;

const CornerBR = styled(CornerBase)`
  bottom: 0;
  right: 0;
  border-bottom-width: 4px;
  border-right-width: 4px;
  border-bottom-right-radius: 12px;
`;

const OverlayBottom = styled.View`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.6);
  align-items: center;
  padding-top: 24px;
  padding-horizontal: 24px;
`;

const ErrorBox = styled.View`
  align-items: center;
  padding: 12px 16px;
  border-radius: 12px;
  background-color: rgba(239, 68, 68, 0.9);
`;

const ErrorText = styled.Text`
  color: ${palette.white};
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  line-height: 20px;
`;

const RetryLink = styled.TouchableOpacity`
  margin-top: 8px;
  min-height: 36px;
  padding: 8px 16px;
  justify-content: center;
`;

const RetryLinkText = styled.Text`
  color: ${palette.white};
  font-size: 14px;
  font-weight: 700;
  text-decoration-line: underline;
`;

const ScanHintText = styled.Text`
  color: #fff;
  font-size: 14px;
`;

const Footer = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px;
  background-color: rgba(0, 0, 0, 0.8);
  align-items: center;
`;

const FooterText = styled.Text`
  color: #a1a1aa;
  font-size: 14px;
  text-align: center;
`;

export default QRScanner;
