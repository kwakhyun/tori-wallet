/**
 * 계정 관리 화면
 *
 * 같은 복구 구문에서 파생한 계정(m/44'/60'/0'/0/n)을 나열하고, 새 계정 추가,
 * 이름 변경, 활성 계정 전환을 제공한다. 송금/스왑/WalletConnect 서명은 항상 활성 계정을
 * from으로 사용하며, signerVault는 암호화 저장소에 기록된 계정만 서명에 쓴다.
 */

import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StatusBar } from 'react-native';
import styled from 'styled-components/native';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { IconButton } from '@/components/common/IconButton';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { useTheme } from '@/hooks/useTheme';
import { useWallet, MAX_ACCOUNT_NAME_LENGTH } from '@/hooks/useWallet';
import { useBalance } from '@/hooks/useBalance';
import { useFiat } from '@/hooks/useFiat';
import { useWalletStore, type Wallet } from '@/store/walletStore';
import { showToast } from '@/store/toastStore';
import { shortenAddress } from '@/utils/address';
import { formatNumber } from '@/utils/format';
import { ButtonStack, HintText, SheetModal } from './components/SettingsUI';

function AccountBalance({ address }: { address: string }) {
  const chainId = useWalletStore(state => state.activeNetworkChainId);
  const symbol = useWalletStore(
    state => state.networks.find(n => n.chainId === chainId)?.symbol ?? 'ETH',
  );
  const { data, isError } = useBalance(address, chainId);
  const { mask } = useFiat();
  const text = isError
    ? '잔액 확인 불가'
    : data
    ? `${formatNumber(data.formatted, 4)} ${symbol}`
    : '…';
  return <AccountBalanceText>{mask(text)}</AccountBalanceText>;
}

export default function AccountsScreen(): React.JSX.Element {
  const { isDarkMode } = useTheme();
  const {
    wallets,
    activeWalletIndex,
    addAccount,
    renameAccount,
    switchAccount,
  } = useWallet();
  const [isAdding, setIsAdding] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Wallet | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [isRenaming, setIsRenaming] = useState(false);

  const handleAdd = useCallback(async () => {
    if (isAdding) return;
    setIsAdding(true);
    try {
      await addAccount();
      showToast('새 계정을 추가했습니다.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      Alert.alert(
        '계정을 추가하지 못했습니다',
        /locked/i.test(message)
          ? '지갑이 잠겨 있습니다. 잠금을 해제한 뒤 다시 시도해주세요.'
          : message || '잠시 후 다시 시도해주세요.',
      );
    } finally {
      setIsAdding(false);
    }
  }, [addAccount, isAdding]);

  const handleSwitch = useCallback(
    (index: number) => {
      if (index === activeWalletIndex) return;
      switchAccount(index);
      showToast(
        `${wallets[index]?.name ?? '계정'}(으)로 전환했습니다.`,
        'success',
      );
    },
    [activeWalletIndex, switchAccount, wallets],
  );

  const openRename = useCallback((wallet: Wallet) => {
    setRenameTarget(wallet);
    setNameInput(wallet.name);
    setNameError(undefined);
  }, []);

  const closeRename = useCallback(() => setRenameTarget(null), []);

  const handleRename = useCallback(async () => {
    if (!renameTarget || isRenaming) return;
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError('계정 이름을 입력해주세요.');
      return;
    }
    setIsRenaming(true);
    try {
      await renameAccount(renameTarget.address, trimmed);
      showToast('계정 이름을 변경했습니다.', 'success');
      setRenameTarget(null);
    } catch (error) {
      setNameError(
        error instanceof Error ? error.message : '이름을 변경하지 못했습니다.',
      );
    } finally {
      setIsRenaming(false);
    }
  }, [isRenaming, nameInput, renameAccount, renameTarget]);

  const renderItem = useCallback(
    ({ item, index }: { item: Wallet; index: number }) => {
      const active = index === activeWalletIndex;
      return (
        <AccountRow $active={active}>
          <AccountTouchable
            onPress={() => handleSwitch(index)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active }}
            accessibilityLabel={`${item.name}, ${shortenAddress(item.address)}${
              active ? ', 사용 중' : ''
            }`}
            accessibilityHint={active ? undefined : '이 계정으로 전환합니다'}
            testID={`account-row-${index}`}
          >
            <Avatar $active={active} importantForAccessibility="no">
              <AvatarText $active={active}>
                {item.name.trim().charAt(0).toUpperCase() || '?'}
              </AvatarText>
            </Avatar>
            <AccountInfo>
              <AccountName numberOfLines={1}>{item.name}</AccountName>
              <AccountAddress>
                {shortenAddress(item.address, 8, 6)}
              </AccountAddress>
              <AccountBalance address={item.address} />
            </AccountInfo>
            {active ? (
              <ActiveLabel importantForAccessibility="no">사용 중</ActiveLabel>
            ) : null}
          </AccountTouchable>
          <IconButton
            icon="✏️"
            accessibilityLabel={`${item.name} 이름 변경`}
            onPress={() => openRename(item)}
            testID={`account-rename-${index}`}
          />
        </AccountRow>
      );
    },
    [activeWalletIndex, handleSwitch, openRename],
  );

  return (
    <Screen testID="Accounts-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScreenHeader title="계정 관리" testID="accounts-header" />
      <FlatList
        data={wallets}
        keyExtractor={item => item.address}
        renderItem={renderItem}
        contentContainerStyle={listStyle}
        ListFooterComponent={
          <Footer>
            <Button
              title={isAdding ? '계정 추가 중...' : '+ 새 계정 추가'}
              onPress={handleAdd}
              loading={isAdding}
              variant="outline"
              fullWidth
              testID="accounts-add"
            />
            <HintText>
              모든 계정은 같은 복구 구문에서 순서대로 만들어집니다. 복구
              구문으로 지갑을 다시 가져오면 첫 번째 계정만 표시되며, 여기서
              계정을 다시 추가하면 같은 주소가 복원됩니다.
            </HintText>
            <HintText>
              계정을 전환하면 이전 계정으로 연결된 dApp의 서명 요청은
              거부됩니다. 필요하면 dApp에 다시 연결하세요.
            </HintText>
          </Footer>
        }
      />

      <SheetModal
        visible={renameTarget !== null}
        title="계정 이름 변경"
        onClose={closeRename}
        testID="account-rename-modal"
      >
        <Input
          label="계정 이름"
          value={nameInput}
          onChangeText={text => {
            setNameInput(text);
            setNameError(undefined);
          }}
          maxLength={MAX_ACCOUNT_NAME_LENGTH}
          autoFocus
          error={nameError}
          testID="account-rename-input"
        />
        <ButtonStack>
          <Button
            title="저장"
            onPress={handleRename}
            loading={isRenaming}
            fullWidth
            testID="account-rename-save"
          />
        </ButtonStack>
      </SheetModal>
    </Screen>
  );
}

const listStyle = { padding: 20, paddingBottom: 40 };

const AccountRow = styled.View<{ $active: boolean }>`
  flex-direction: row;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  padding-right: ${({ theme }) => theme.spacing.xs}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-width: 1px;
  border-color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.border};
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.primarySubtle : theme.colors.surface};
`;

const AccountTouchable = styled.TouchableOpacity`
  flex: 1;
  flex-direction: row;
  align-items: center;
  min-height: 72px;
  padding: 12px ${({ theme }) => theme.spacing.md}px;
`;

const Avatar = styled.View<{ $active: boolean }>`
  width: 40px;
  height: 40px;
  border-radius: 20px;
  align-items: center;
  justify-content: center;
  margin-right: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.backgroundTertiary};
`;

const AvatarText = styled.Text<{ $active: boolean }>`
  color: ${({ theme, $active }) =>
    $active ? theme.colors.onPrimary : theme.colors.textPrimary};
  font-size: 18px;
  font-weight: 700;
`;

const AccountInfo = styled.View`
  flex: 1;
`;

const AccountName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
`;

const AccountAddress = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  font-family: monospace;
  margin-top: 2px;
`;

const AccountBalanceText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  margin-top: 2px;
`;

const ActiveLabel = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 13px;
  font-weight: 700;
  margin-left: ${({ theme }) => theme.spacing.sm}px;
`;

const Footer = styled.View`
  margin-top: ${({ theme }) => theme.spacing.md}px;
  gap: ${({ theme }) => theme.spacing.sm}px;
`;
