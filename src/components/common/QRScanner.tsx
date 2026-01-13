/**
 * Tori Wallet - QR Scanner Component
 * 카메라를 사용한 QR 코드 스캔 컴포넌트
 */

import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components/native';
import {
  Modal,
  Alert,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import { palette } from '@/styles/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
  title?: string;
}

export function QRScanner({
  visible,
  onClose,
  onScan,
  title = 'QR 코드 스캔',
}: Props) {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [isActive, setIsActive] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  // 권한 요청
  useEffect(() => {
    if (visible && !hasPermission) {
      requestPermission().then(granted => {
        if (!granted) {
          Alert.alert(
            '카메라 권한 필요',
            'QR 코드를 스캔하려면 카메라 권한이 필요합니다. 설정에서 권한을 허용해주세요.',
            [
              { text: '취소', onPress: onClose, style: 'cancel' },
              {
                text: '설정으로 이동',
                onPress: () => {
                  Linking.openSettings();
                  onClose();
                },
              },
            ],
          );
        }
      });
    }
  }, [visible, hasPermission, requestPermission, onClose]);

  // 모달 열림/닫힘에 따라 카메라 활성화
  useEffect(() => {
    if (visible && hasPermission) {
      setIsActive(true);
      setHasScanned(false);
    } else {
      setIsActive(false);
    }
  }, [visible, hasPermission]);

  // QR 코드 스캔 핸들러
  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      if (hasScanned) return;

      const qrCode = codes.find(code => code.type === 'qr');
      if (qrCode?.value) {
        setHasScanned(true);

        // 이더리움 주소 추출 (EIP-681 형식 지원)
        let address = qrCode.value;

        // ethereum:0x... 형식 파싱
        if (address.startsWith('ethereum:')) {
          const match = address.match(/ethereum:(0x[a-fA-F0-9]{40})/);
          if (match) {
            address = match[1];
          }
        }

        // 0x로 시작하는 주소만 추출
        const addressMatch = address.match(/0x[a-fA-F0-9]{40}/);
        if (addressMatch) {
          address = addressMatch[0];
        }

        onScan(address);
        onClose();
      }
    },
  });

  const handleClose = useCallback(() => {
    setIsActive(false);
    onClose();
  }, [onClose]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <Container testID="qr-scanner-container">
        <Header>
          <CloseButton onPress={handleClose} testID="qr-scanner-close">
            <CloseButtonText>✕</CloseButtonText>
          </CloseButton>
          <HeaderTitle testID="qr-scanner-title">{title}</HeaderTitle>
          <Placeholder />
        </Header>

        <CameraContainer testID="qr-scanner-camera-container">
          {!hasPermission ? (
            <PermissionContainer testID="qr-scanner-permission-container">
              <PermissionIcon>📷</PermissionIcon>
              <PermissionText>카메라 권한을 허용해주세요</PermissionText>
              <PermissionButton
                onPress={requestPermission}
                testID="qr-scanner-permission-button"
              >
                <PermissionButtonText>권한 요청</PermissionButtonText>
              </PermissionButton>
            </PermissionContainer>
          ) : !device ? (
            <LoadingContainer testID="qr-scanner-loading">
              <ActivityIndicator size="large" color={palette.indigo[500]} />
              <LoadingText>카메라 준비 중...</LoadingText>
            </LoadingContainer>
          ) : (
            <>
              <StyledCamera
                device={device}
                isActive={isActive}
                codeScanner={codeScanner}
              />
              <ScanOverlay>
                <OverlayTop />
                <MiddleRow>
                  <OverlaySide />
                  <ScanFrame>
                    <CornerTL />
                    <CornerTR />
                    <CornerBL />
                    <CornerBR />
                  </ScanFrame>
                  <OverlaySide />
                </MiddleRow>
                <OverlayBottom>
                  <ScanHintText>QR 코드를 프레임 안에 맞춰주세요</ScanHintText>
                </OverlayBottom>
              </ScanOverlay>
            </>
          )}
        </CameraContainer>

        <Footer>
          <FooterText>지갑 주소가 포함된 QR 코드를 스캔하세요</FooterText>
        </Footer>
      </Container>
    </Modal>
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
  padding: ${({ theme }) => theme.spacing.lg}px;
  padding-top: ${Platform.OS === 'ios' ? 60 : 16}px;
  background-color: rgba(0, 0, 0, 0.8);
`;

const CloseButton = styled.TouchableOpacity`
  width: 40px;
  height: 40px;
  border-radius: 20px;
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

const ScanFrame = styled.View`
  width: 250px;
  height: 250px;
  position: relative;
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
`;

const ScanHintText = styled.Text`
  color: #fff;
  font-size: 14px;
`;

const Footer = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px;
  padding-bottom: ${Platform.OS === 'ios' ? 40 : 24}px;
  background-color: rgba(0, 0, 0, 0.8);
  align-items: center;
`;

const FooterText = styled.Text`
  color: #a1a1aa;
  font-size: 14px;
  text-align: center;
`;

export default QRScanner;
