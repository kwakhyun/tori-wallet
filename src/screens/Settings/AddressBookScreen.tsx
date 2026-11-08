/**
 * 주소록 화면
 *
 * 두 가지로 쓰인다.
 *  1) 라우트 'AddressBook' — 주소 관리(추가/편집/삭제/즐겨찾기). params.mode === 'select'면
 *     선택한 주소를 송금 화면(recipient)으로 돌려준다.
 *  2) 임베드 피커 — 송금 화면이 모달 안에 넣고 selectionMode, onSelectAddress, onClose를 넘긴다.
 *
 * onSelectAddress(address, name): name은 주소록에 저장된 이름이다. 저장되지 않은 최근
 * 주소는 name 없이(undefined) 전달해 송금 화면이 저장된 이름처럼 보여 주지 않게 한다.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StatusBar } from 'react-native';
import { readClipboard } from '@/utils/clipboard';
import styled, { useTheme as useStyledTheme } from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { isAddress } from 'viem';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { IconButton } from '@/components/common/IconButton';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/StateViews';
import { QRScanner } from '@/components/common/QRScanner';
import { useTheme } from '@/hooks/useTheme';
import {
  useAddressBook,
  useAddressSearch,
  useFavoriteAddresses,
} from '@/realm/hooks';
import type { AddressBookEntry } from '@/realm/schemas';
import { useSecurityStore } from '@/store/securityStore';
import { showToast } from '@/store/toastStore';
import { recipientOf, type ScanResult } from '@/utils/paymentUri';
import { shortenAddress } from '@/utils/address';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { ButtonStack, SheetModal } from './components/SettingsUI';

export interface AddressBookScreenProps {
  /** 선택 모드 (송금 화면 피커). 항목을 누르면 onSelectAddress를 호출한다. */
  selectionMode?: boolean;
  /**
   * name: 주소록에 저장된 이름. 저장되지 않은 최근 주소는 undefined.
   * (메서드 표기: 기존 `(address, name: string) => void` 핸들러도 받을 수 있게 한다)
   */
  onSelectAddress?(address: `0x${string}`, name?: string): void;
  /** 임베드(모달)로 쓸 때 헤더 닫기 버튼 동작 */
  onClose?: () => void;
}

type Tab = 'addressBook' | 'favorites' | 'recent';
type RecentItem = { address: `0x${string}`; lastUsed: number };

const TABS: { key: Tab; label: string }[] = [
  { key: 'addressBook', label: '주소록' },
  { key: 'favorites', label: '즐겨찾기' },
  { key: 'recent', label: '최근' },
];

const NAME_MAX_LENGTH = 30;

export function AddressBookScreen({
  selectionMode: selectionModeProp,
  onSelectAddress,
  onClose,
}: AddressBookScreenProps): React.JSX.Element {
  const { isDarkMode } = useTheme();
  const theme = useStyledTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const routeMode = (
    route?.params as { mode?: 'manage' | 'select' } | undefined
  )?.mode;
  const selectionMode = selectionModeProp ?? routeMode === 'select';

  const {
    addresses: addressBook,
    isLoading,
    addAddress,
    updateAddress,
    deleteAddress,
    toggleFavorite,
  } = useAddressBook();
  const { favorites } = useFavoriteAddresses();
  const { recentAddresses, legacyAddressBook } = useSecurityStore(
    useShallow(state => ({
      recentAddresses: state.recentAddresses,
      legacyAddressBook: state.addressBook,
    })),
  );

  // 레거시(Zustand) 주소록 → Realm 마이그레이션 (최초 1회)
  const [hasMigrated, setHasMigrated] = useState(false);
  useEffect(() => {
    if (
      hasMigrated ||
      isLoading ||
      addressBook.length > 0 ||
      !legacyAddressBook ||
      legacyAddressBook.length === 0
    )
      return;
    setHasMigrated(true);
    (async () => {
      for (const entry of legacyAddressBook) {
        try {
          await addAddress({
            address: entry.address,
            name: entry.name,
            chainId: entry.chainId ?? 1,
            notes: entry.memo,
          });
        } catch {
          // 중복 등은 무시
        }
      }
    })();
  }, [isLoading, addressBook, legacyAddressBook, addAddress, hasMigrated]);

  const [activeTab, setActiveTab] = useState<Tab>('addressBook');
  const [query, setQuery] = useState('');
  const { results: searchResults, isSearching } = useAddressSearch(query);
  const searching = query.trim().length > 0;

  // 편집 폼
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AddressBookEntry | null>(
    null,
  );
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    address?: string;
  }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const savedNameOf = useCallback(
    (value: string) =>
      addressBook.find(a => a.address.toLowerCase() === value.toLowerCase())
        ?.name,
    [addressBook],
  );

  const openAdd = useCallback(() => {
    setEditingEntry(null);
    setName('');
    setAddress('');
    setMemo('');
    setFormErrors({});
    setShowForm(true);
  }, []);

  const openEdit = useCallback((entry: AddressBookEntry) => {
    setEditingEntry(entry);
    setName(entry.name);
    setAddress(entry.address);
    setMemo(entry.notes || '');
    setFormErrors({});
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setShowScanner(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    const errors: { name?: string; address?: string } = {};
    if (!trimmedName) errors.name = '이름을 입력해주세요.';
    if (!isAddress(trimmedAddress)) {
      errors.address =
        '올바른 이더리움 주소(0x로 시작하는 40자리)를 입력해주세요.';
    } else {
      const duplicate = addressBook.find(
        a =>
          a.address.toLowerCase() === trimmedAddress.toLowerCase() &&
          a.id !== editingEntry?.id,
      );
      if (duplicate)
        errors.address = `이미 "${duplicate.name}"(으)로 저장된 주소입니다.`;
    }
    setFormErrors(errors);
    if (errors.name || errors.address) return;

    setIsSaving(true);
    try {
      if (editingEntry) {
        await updateAddress(editingEntry.id, {
          name: trimmedName,
          address: trimmedAddress,
          // 빈 문자열로 보내야 기존 메모가 지워진다.
          notes: memo.trim(),
        });
        showToast('주소를 수정했습니다.', 'success');
      } else {
        await addAddress({
          address: trimmedAddress,
          name: trimmedName,
          chainId: 1,
          notes: memo.trim() || undefined,
        });
        showToast('주소를 추가했습니다.', 'success');
      }
      setShowForm(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/already exists/i.test(message)) {
        setFormErrors({ address: '이미 주소록에 있는 주소입니다.' });
      } else {
        Alert.alert(
          '저장 실패',
          '주소를 저장하지 못했습니다. 다시 시도해주세요.',
        );
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    address,
    addAddress,
    addressBook,
    editingEntry,
    isSaving,
    memo,
    name,
    updateAddress,
  ]);

  const handleDelete = useCallback(
    (entry: AddressBookEntry) => {
      Alert.alert('주소 삭제', `"${entry.name}"을(를) 주소록에서 삭제할까요?`, [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAddress(entry.id);
              showToast('주소를 삭제했습니다.', 'success');
            } catch {
              Alert.alert('삭제 실패', '주소를 삭제하지 못했습니다.');
            }
          },
        },
      ]);
    },
    [deleteAddress],
  );

  const handleToggleFavorite = useCallback(
    async (entry: AddressBookEntry) => {
      try {
        await toggleFavorite(entry.id);
      } catch {
        showToast('즐겨찾기를 변경하지 못했습니다.', 'error');
      }
    },
    [toggleFavorite],
  );

  const select = useCallback(
    (value: string, savedName?: string) => {
      const target = value as `0x${string}`;
      if (onSelectAddress) {
        onSelectAddress(target, savedName);
        return;
      }
      if (selectionMode) {
        navigation.popTo(
          'SendTransaction',
          { recipient: target },
          { merge: true },
        );
      }
    },
    [navigation, onSelectAddress, selectionMode],
  );

  const handlePaste = useCallback(async () => {
    try {
      const text = (await readClipboard()).trim();
      if (text && isAddress(text)) {
        setAddress(text);
        setFormErrors(previous => ({ ...previous, address: undefined }));
      } else {
        setFormErrors(previous => ({
          ...previous,
          address: '클립보드에 올바른 지갑 주소가 없습니다.',
        }));
      }
    } catch {
      showToast('클립보드를 읽을 수 없습니다.', 'error');
    }
  }, []);

  const handleScan = useCallback((result: ScanResult) => {
    const scanned = recipientOf(result);
    setShowScanner(false);
    if (scanned && isAddress(scanned)) {
      setAddress(scanned);
      setFormErrors(previous => ({ ...previous, address: undefined }));
    } else {
      setFormErrors(previous => ({
        ...previous,
        address: '지갑 주소가 담긴 QR 코드가 아닙니다.',
      }));
    }
  }, []);

  const entryData = useMemo(() => {
    if (activeTab === 'favorites') {
      return searching ? searchResults.filter(e => e.isFavorite) : favorites;
    }
    return searching ? searchResults : addressBook;
  }, [activeTab, addressBook, favorites, searchResults, searching]);

  const recentData = useMemo(() => {
    const list: RecentItem[] = recentAddresses ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      item =>
        item.address.toLowerCase().includes(q) ||
        (savedNameOf(item.address) ?? '').toLowerCase().includes(q),
    );
  }, [query, recentAddresses, savedNameOf]);

  const renderEntry = useCallback(
    ({ item }: { item: AddressBookEntry }) => (
      <Row>
        <RowMain
          onPress={() =>
            selectionMode ? select(item.address, item.name) : openEdit(item)
          }
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${shortenAddress(item.address)}${
            item.isFavorite ? ', 즐겨찾기' : ''
          }`}
          accessibilityHint={
            selectionMode
              ? '이 주소를 받는 주소로 선택합니다'
              : '주소를 편집합니다'
          }
          testID={`address-entry-${item.id}`}
        >
          <NameLine>
            <EntryName numberOfLines={1}>{item.name}</EntryName>
            {item.isFavorite ? (
              <Star importantForAccessibility="no">★</Star>
            ) : null}
          </NameLine>
          <EntryAddress>{shortenAddress(item.address, 10, 8)}</EntryAddress>
          {item.notes ? (
            <EntryMemo numberOfLines={1}>{item.notes}</EntryMemo>
          ) : null}
        </RowMain>
        {selectionMode ? (
          <Chevron importantForAccessibility="no">›</Chevron>
        ) : (
          <>
            <IconButton
              icon={item.isFavorite ? '★' : '☆'}
              accessibilityLabel={
                item.isFavorite
                  ? `${item.name} 즐겨찾기 해제`
                  : `${item.name} 즐겨찾기 추가`
              }
              accessibilityState={{ selected: item.isFavorite }}
              onPress={() => handleToggleFavorite(item)}
              testID={`address-favorite-${item.id}`}
            />
            <IconButton
              icon="🗑️"
              accessibilityLabel={`${item.name} 삭제`}
              onPress={() => handleDelete(item)}
              testID={`address-delete-${item.id}`}
            />
          </>
        )}
      </Row>
    ),
    [handleDelete, handleToggleFavorite, openEdit, select, selectionMode],
  );

  const renderRecent = useCallback(
    ({ item }: { item: RecentItem }) => {
      const savedName = savedNameOf(item.address);
      return (
        <Row>
          <RowMain
            onPress={() =>
              selectionMode ? select(item.address, savedName) : undefined
            }
            disabled={!selectionMode}
            accessibilityRole={selectionMode ? 'button' : 'text'}
            accessibilityLabel={`${
              savedName ? `${savedName}, ` : ''
            }${shortenAddress(item.address)}`}
            testID={`recent-entry-${item.address}`}
          >
            {savedName ? (
              <EntryName numberOfLines={1}>{savedName}</EntryName>
            ) : null}
            <EntryAddress>{shortenAddress(item.address, 10, 8)}</EntryAddress>
            <EntryMemo>{formatDate(item.lastUsed)}</EntryMemo>
          </RowMain>
          {selectionMode ? (
            <Chevron importantForAccessibility="no">›</Chevron>
          ) : null}
        </Row>
      );
    },
    [savedNameOf, select, selectionMode],
  );

  const showRecent = activeTab === 'recent';

  return (
    <Screen testID="address-book-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        title={selectionMode ? '주소 선택' : '주소록'}
        // 임베드 피커에 onClose가 없으면 뒤로 가기가 바깥 화면(송금)을 닫으므로 숨긴다.
        leftIcon={onClose ? 'close' : onSelectAddress ? null : 'back'}
        onBack={onClose}
        testID="address-book-header"
        right={
          selectionMode ? null : (
            <IconButton
              icon="＋"
              accessibilityLabel="주소 추가"
              onPress={openAdd}
              testID="address-book-add"
            />
          )
        }
      />

      <Content>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="이름, 주소, 메모 검색"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="주소록 검색"
          testID="address-book-search"
        />

        <Tabs accessibilityRole="tablist">
          {TABS.map(tab => (
            <TabButton
              key={tab.key}
              $active={activeTab === tab.key}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab.key }}
              accessibilityLabel={tab.label}
              testID={`address-book-tab-${tab.key}`}
            >
              <TabText $active={activeTab === tab.key}>{tab.label}</TabText>
            </TabButton>
          ))}
        </Tabs>

        {isLoading || (searching && isSearching && !showRecent) ? (
          <Loading>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </Loading>
        ) : showRecent ? (
          <FlatList
            data={recentData}
            keyExtractor={item => `${item.address}-${item.lastUsed}`}
            renderItem={renderRecent}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={listStyle}
            ListEmptyComponent={
              <EmptyState
                icon="🕐"
                title={
                  searching
                    ? '검색 결과가 없습니다'
                    : '최근 사용한 주소가 없습니다'
                }
                message={searching ? undefined : '송금하면 자동으로 기록됩니다'}
                testID="address-book-empty"
              />
            }
          />
        ) : (
          <FlatList
            data={entryData}
            keyExtractor={item => item.id}
            renderItem={renderEntry}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={listStyle}
            ListEmptyComponent={
              searching ? (
                <EmptyState
                  icon="🔍"
                  title="검색 결과가 없습니다"
                  testID="address-book-empty"
                />
              ) : activeTab === 'favorites' ? (
                <EmptyState
                  icon="☆"
                  title="즐겨찾기한 주소가 없습니다"
                  message="주소록에서 ☆를 눌러 추가하세요"
                  testID="address-book-empty"
                />
              ) : (
                <EmptyState
                  icon="📇"
                  title="저장된 주소가 없습니다"
                  message="자주 보내는 주소를 저장해 두세요"
                  actionLabel={selectionMode ? undefined : '주소 추가'}
                  onAction={selectionMode ? undefined : openAdd}
                  testID="address-book-empty"
                />
              )
            }
          />
        )}
      </Content>

      <SheetModal
        visible={showForm}
        title={editingEntry ? '주소 편집' : '주소 추가'}
        onClose={closeForm}
        testID="address-form-modal"
      >
        <Field>
          <Input
            label="이름"
            value={name}
            onChangeText={text => {
              setName(text);
              setFormErrors(previous => ({ ...previous, name: undefined }));
            }}
            placeholder="예: 친구 지갑"
            maxLength={NAME_MAX_LENGTH}
            error={formErrors.name}
            testID="address-form-name"
          />
        </Field>
        <Field>
          <Input
            label="주소"
            value={address}
            onChangeText={text => {
              setAddress(text);
              setFormErrors(previous => ({ ...previous, address: undefined }));
            }}
            placeholder="0x..."
            autoCapitalize="none"
            autoCorrect={false}
            error={formErrors.address}
            testID="address-form-address"
          />
          <InlineActions>
            <Button
              title="붙여넣기"
              variant="outline"
              size="small"
              onPress={handlePaste}
              testID="address-form-paste"
            />
            <Button
              title="QR 스캔"
              variant="outline"
              size="small"
              onPress={() => setShowScanner(true)}
              testID="address-form-scan"
            />
          </InlineActions>
        </Field>
        <Field>
          <Input
            label="메모 (선택)"
            value={memo}
            onChangeText={setMemo}
            placeholder="메모를 입력하세요"
            maxLength={100}
            multiline
            testID="address-form-memo"
          />
        </Field>
        <ButtonStack>
          <Button
            title={editingEntry ? '저장' : '추가'}
            onPress={handleSave}
            loading={isSaving}
            fullWidth
            testID="address-form-save"
          />
          {editingEntry ? (
            <Button
              title="삭제"
              variant="text"
              onPress={() => {
                const entry = editingEntry;
                closeForm();
                handleDelete(entry);
              }}
              testID="address-form-delete"
            />
          ) : null}
        </ButtonStack>
        <QRScanner
          visible={showScanner}
          onClose={() => setShowScanner(false)}
          onScan={handleScan}
          mode="address"
          title="주소 QR 스캔"
        />
      </SheetModal>
    </Screen>
  );
}

function formatDate(timestamp: number | Date) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const listStyle = { paddingBottom: 24, flexGrow: 1 };

const Content = styled.View`
  flex: 1;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
`;

const Tabs = styled.View`
  flex-direction: row;
  margin: ${({ theme }) => theme.spacing.md}px 0;
  padding: 4px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

const TabButton = styled.TouchableOpacity<{ $active: boolean }>`
  flex: 1;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : 'transparent'};
`;

const TabText = styled.Text<{ $active: boolean }>`
  color: ${({ theme, $active }) =>
    $active ? theme.colors.onPrimary : theme.colors.textSecondary};
  font-size: 14px;
  font-weight: ${({ $active }) => ($active ? '600' : '400')};
`;

const Loading = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

const Row = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  padding-right: ${({ theme }) => theme.spacing.xs}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

const RowMain = styled.TouchableOpacity`
  flex: 1;
  min-height: 56px;
  justify-content: center;
  padding: 10px ${({ theme }) => theme.spacing.md}px;
`;

const NameLine = styled.View`
  flex-direction: row;
  align-items: center;
`;

const EntryName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 1;
`;

const Star = styled.Text`
  color: ${({ theme }) => theme.colors.warning};
  font-size: 14px;
  margin-left: ${({ theme }) => theme.spacing.xs}px;
`;

const EntryAddress = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  font-family: monospace;
  margin-top: 2px;
`;

const EntryMemo = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  margin-top: 2px;
`;

const Chevron = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 22px;
  padding: 0 ${({ theme }) => theme.spacing.sm}px;
`;

const Field = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const InlineActions = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.sm}px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

export default AddressBookScreen;
