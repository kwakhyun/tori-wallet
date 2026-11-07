/**
 * 커스텀 EVM 네트워크 추가 모달
 *
 * - 이름, RPC URL(https), 체인 ID, 통화 기호, 탐색기 URL(https, 선택), 테스트넷 여부
 * - 기본 네트워크/이미 추가된 체인 ID는 거부
 * - 저장 전 RPC에 eth_chainId를 호출해 입력한 체인 ID와 일치해야 한다
 *   (다른 체인의 RPC를 등록하면 서명/잔액이 엉뚱한 체인을 가리킬 수 있다)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Switch } from 'react-native';
import { AppModal } from '@/components/common/AppModal';
import styled, { useTheme } from 'styled-components/native';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { chainClient } from '@/services/chainClient';
import {
  validateCustomNetworkInput,
  type CustomNetworkField,
} from '@/services/customNetworks';
import {
  BUILT_IN_CHAIN_IDS,
  useWalletStore,
  type Network,
} from '@/store/walletStore';
import { showToast } from '@/store/toastStore';

interface AddNetworkModalProps {
  visible: boolean;
  onClose: () => void;
  /** 추가에 성공하면 호출 (모달은 호출 측이 닫는다) */
  onAdded?: (network: Network) => void;
}

const EMPTY_FORM = {
  name: '',
  rpcUrl: '',
  chainId: '',
  symbol: '',
  blockExplorerUrl: '',
  isTestnet: false,
};

type Errors = Partial<Record<CustomNetworkField | 'form', string>>;

export function AddNetworkModal({
  visible,
  onClose,
  onAdded,
}: AddNetworkModalProps): React.JSX.Element {
  const theme = useTheme();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [isVerifying, setIsVerifying] = useState(false);
  // 확인 중에 창을 닫으면 결과를 버린다.
  const session = useRef(0);

  useEffect(() => {
    session.current += 1;
    if (visible) {
      setForm(EMPTY_FORM);
      setErrors({});
      setIsVerifying(false);
    }
  }, [visible]);

  useEffect(
    () => () => {
      session.current += 1;
    },
    [],
  );

  const update = useCallback(
    (field: keyof typeof EMPTY_FORM) => (value: string | boolean) => {
      setForm(previous => ({ ...previous, [field]: value }));
      setErrors(previous => ({
        ...previous,
        [field]: undefined,
        form: undefined,
      }));
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (isVerifying) return;
    const networks = useWalletStore.getState().networks;
    const validation = validateCustomNetworkInput(
      form,
      BUILT_IN_CHAIN_IDS,
      networks.map(network => network.chainId),
    );
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    const network = validation.network;
    const current = session.current;
    setIsVerifying(true);
    const check = await chainClient.verifyRpcChainId(
      network.rpcUrl,
      network.chainId,
    );
    if (current !== session.current) return;
    setIsVerifying(false);
    if (!check.ok) {
      setErrors(
        check.reason === 'mismatch'
          ? {
              chainId: `RPC가 알려준 체인 ID는 ${check.actualChainId}입니다. 입력한 체인 ID와 일치해야 합니다.`,
            }
          : {
              rpcUrl: `RPC에 연결할 수 없습니다. URL을 확인해주세요. (${check.message})`,
            },
      );
      return;
    }

    try {
      const added: Network = { ...network, isCustom: true };
      useWalletStore.getState().addNetwork(added);
      showToast(`${network.name} 네트워크를 추가했습니다.`, 'success');
      onAdded?.(added);
    } catch (error) {
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : '네트워크를 추가하지 못했습니다.',
      });
    }
  }, [form, isVerifying, onAdded]);

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onLock={onClose}
    >
      <Screen testID="add-network-modal">
        <ScreenHeader
          title="네트워크 추가"
          leftIcon="close"
          onBack={onClose}
          backTestID="add-network-close"
        />
        <Body keyboardShouldPersistTaps="handled">
          <Notice>
            <NoticeText>
              신뢰할 수 있는 RPC만 추가하세요. 악의적인 RPC는 잔액이나 거래
              결과를 잘못 보여 주거나 IP 주소를 수집할 수 있습니다. 스왑, 시세,
              구매 기능은 커스텀 네트워크에서 지원되지 않습니다.
            </NoticeText>
          </Notice>
          <Field>
            <Input
              label="네트워크 이름"
              value={form.name}
              onChangeText={update('name')}
              placeholder="예: BNB Smart Chain"
              maxLength={40}
              error={errors.name}
              testID="add-network-name"
            />
          </Field>
          <Field>
            <Input
              label="RPC URL"
              value={form.rpcUrl}
              onChangeText={update('rpcUrl')}
              placeholder="https://"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              error={errors.rpcUrl}
              testID="add-network-rpc"
            />
          </Field>
          <Field>
            <Input
              label="체인 ID"
              value={form.chainId}
              onChangeText={update('chainId')}
              placeholder="예: 56"
              keyboardType="number-pad"
              error={errors.chainId}
              helper="RPC에 연결해 체인 ID가 일치하는지 확인합니다."
              testID="add-network-chain-id"
            />
          </Field>
          <Field>
            <Input
              label="통화 기호"
              value={form.symbol}
              onChangeText={update('symbol')}
              placeholder="예: BNB"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              error={errors.symbol}
              testID="add-network-symbol"
            />
          </Field>
          <Field>
            <Input
              label="블록 탐색기 URL (선택)"
              value={form.blockExplorerUrl}
              onChangeText={update('blockExplorerUrl')}
              placeholder="https://"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              error={errors.blockExplorerUrl}
              testID="add-network-explorer"
            />
          </Field>
          <SwitchRow>
            <SwitchText
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              <SwitchLabel>테스트넷</SwitchLabel>
              <SwitchHint>실제 가치가 없는 테스트용 네트워크</SwitchHint>
            </SwitchText>
            <Switch
              value={form.isTestnet}
              onValueChange={update('isTestnet')}
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.primary,
              }}
              thumbColor={theme.colors.onPrimary}
              ios_backgroundColor={theme.colors.border}
              accessibilityRole="switch"
              accessibilityLabel="테스트넷"
              accessibilityState={{ checked: form.isTestnet }}
              testID="add-network-testnet"
            />
          </SwitchRow>
          {errors.form ? (
            <FormError accessibilityRole="alert">{errors.form}</FormError>
          ) : null}
          <Button
            title={isVerifying ? 'RPC 확인 중...' : '네트워크 추가'}
            onPress={handleSubmit}
            loading={isVerifying}
            fullWidth
            testID="add-network-submit"
          />
        </Body>
      </Screen>
    </AppModal>
  );
}

const Body = styled.ScrollView.attrs({
  contentContainerStyle: { padding: 20, paddingBottom: 40 },
})`
  flex: 1;
`;

const Notice = styled.View`
  background-color: ${({ theme }) => theme.colors.warningSubtle};
  border-color: ${({ theme }) => theme.colors.warning};
  border-width: 1px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const NoticeText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 13px;
  line-height: 19px;
`;

const Field = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const SwitchRow = styled.View`
  flex-direction: row;
  align-items: center;
  min-height: 56px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const SwitchText = styled.View`
  flex: 1;
`;

const SwitchLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
`;

const SwitchHint = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  margin-top: 2px;
`;

const FormError = styled.Text`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

export default AddNetworkModal;
