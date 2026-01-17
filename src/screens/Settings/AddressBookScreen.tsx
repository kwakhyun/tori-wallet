/**
 * 주소록 관리 화면
 */

import React, { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components/native';
import {
  SafeAreaView,
  StatusBar,
  FlatList,
  Alert,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useAddressBook, useFavoriteAddresses } from '@/realm/hooks';
import { useSecurityStore } from '@/store/securityStore';
import type { AddressBookEntry } from '@/realm/schemas';
import { isAddress } from 'viem';

interface Props {
  onSelectAddress?: (address: `0x${string}`, name: string) => void;
  selectionMode?: boolean;
}

export function AddressBookScreen({
  onSelectAddress,
  selectionMode = false,
}: Props) {
  // Realm 훅 사용
  const {
    addresses: addressBook,
    isLoading,
    addAddress,
    updateAddress,
    deleteAddress,
    toggleFavorite,
  } = useAddressBook();

  // 즐겨찾기 목록
  const { favorites } = useFavoriteAddresses();

  // 최근 주소는 여전히 Zustand에서 관리 (간단한 리스트이므로)
  const { recentAddresses, addressBook: legacyAddressBook } =
    useSecurityStore();

  // 레거시 데이터 마이그레이션 (최초 1회)
  const [hasMigrated, setHasMigrated] = useState(false);

  useEffect(() => {
    const migrateFromZustand = async () => {
      if (hasMigrated || legacyAddressBook.length === 0) return;

      // 기존 Zustand 주소록에서 Realm으로 마이그레이션
      for (const entry of legacyAddressBook) {
        try {
          // 이미 Realm에 있는지 확인 (중복 방지)
          const exists = addressBook.find(
            a => a.address.toLowerCase() === entry.address.toLowerCase(),
          );
          if (!exists) {
            await addAddress({
              address: entry.address,
              name: entry.name,
              chainId: entry.chainId ?? 1,
              notes: entry.memo,
            });
          }
        } catch {
          // 중복 등 오류 무시
        }
      }
      setHasMigrated(true);
    };

    if (
      !isLoading &&
      addressBook.length === 0 &&
      legacyAddressBook.length > 0
    ) {
      migrateFromZustand();
    }
  }, [isLoading, addressBook, legacyAddressBook, addAddress, hasMigrated]);

  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AddressBookEntry | null>(
    null,
  );
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');
  const [activeTab, setActiveTab] = useState<
    'addressBook' | 'favorites' | 'recent'
  >('addressBook');
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenAddModal = useCallback(() => {
    setEditingEntry(null);
    setName('');
    setAddress('');
    setMemo('');
    setShowModal(true);
  }, []);

  const handleOpenEditModal = useCallback((entry: AddressBookEntry) => {
    setEditingEntry(entry);
    setName(entry.name);
    setAddress(entry.address);
    setMemo(entry.notes || '');
    setShowModal(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('오류', '이름을 입력해주세요.');
      return;
    }

    if (!isAddress(address)) {
      Alert.alert('오류', '유효한 이더리움 주소를 입력해주세요.');
      return;
    }

    // 중복 주소 체크 (편집 시 자기 자신 제외)
    const existing = addressBook.find(
      a => a.address.toLowerCase() === address.toLowerCase(),
    );
    if (existing && (!editingEntry || existing.id !== editingEntry.id)) {
      Alert.alert('오류', '이미 등록된 주소입니다.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingEntry) {
        await updateAddress(editingEntry.id, {
          name: name.trim(),
          notes: memo.trim() || undefined,
        });
        Alert.alert('완료', '주소가 수정되었습니다.');
      } else {
        await addAddress({
          address: address as `0x${string}`,
          name: name.trim(),
          chainId: 1,
          notes: memo.trim() || undefined,
        });
        Alert.alert('완료', '주소가 추가되었습니다.');
      }
      setShowModal(false);
    } catch {
      Alert.alert('오류', '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }, [
    name,
    address,
    memo,
    editingEntry,
    addressBook,
    addAddress,
    updateAddress,
  ]);

  const handleDelete = useCallback(
    (entry: AddressBookEntry) => {
      Alert.alert(
        '주소 삭제',
        `"${entry.name}"을(를) 주소록에서 삭제하시겠습니까?`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '삭제',
            style: 'destructive',
            onPress: async () => {
              await deleteAddress(entry.id);
            },
          },
        ],
      );
    },
    [deleteAddress],
  );

  const handleToggleFavorite = useCallback(
    async (entry: AddressBookEntry) => {
      await toggleFavorite(entry.id);
    },
    [toggleFavorite],
  );

  const handleSelectEntry = useCallback(
    (entry: AddressBookEntry | { address: `0x${string}` }) => {
      if (selectionMode && onSelectAddress) {
        const entryName = 'name' in entry ? entry.name : '최근 주소';
        onSelectAddress(entry.address as `0x${string}`, entryName);
      }
    },
    [selectionMode, onSelectAddress],
  );

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
  };

  const formatDate = (timestamp: number | Date) => {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderAddressItem = useCallback(
    ({ item }: { item: AddressBookEntry }) => (
      <AddressItem
        onPress={() => handleSelectEntry(item)}
        onLongPress={() => !selectionMode && handleOpenEditModal(item)}
        activeOpacity={0.7}
      >
        <AddressInfo>
          <NameRow>
            <AddressName>{item.name}</AddressName>
            {item.isFavorite && <FavoriteIcon>★</FavoriteIcon>}
          </NameRow>
          <AddressText>{truncateAddress(item.address)}</AddressText>
          {item.notes && <MemoText>{item.notes}</MemoText>}
        </AddressInfo>
        {!selectionMode && (
          <ActionButtons>
            <ActionButton onPress={() => handleToggleFavorite(item)}>
              <ActionButtonText>{item.isFavorite ? '★' : '☆'}</ActionButtonText>
            </ActionButton>
            <ActionButton onPress={() => handleOpenEditModal(item)}>
              <ActionButtonText>편집</ActionButtonText>
            </ActionButton>
            <ActionButton onPress={() => handleDelete(item)}>
              <ActionButtonText $danger>삭제</ActionButtonText>
            </ActionButton>
          </ActionButtons>
        )}
        {selectionMode && <SelectArrow>›</SelectArrow>}
      </AddressItem>
    ),
    [
      handleSelectEntry,
      handleOpenEditModal,
      handleDelete,
      handleToggleFavorite,
      selectionMode,
    ],
  );

  const renderRecentItem = useCallback(
    ({ item }: { item: { address: `0x${string}`; lastUsed: number } }) => {
      const savedEntry = addressBook.find(
        a => a.address.toLowerCase() === item.address.toLowerCase(),
      );
      return (
        <AddressItem
          onPress={() => handleSelectEntry(item)}
          activeOpacity={0.7}
        >
          <AddressInfo>
            {savedEntry && <AddressName>{savedEntry.name}</AddressName>}
            <AddressText>{truncateAddress(item.address)}</AddressText>
            <MemoText>{formatDate(item.lastUsed)}</MemoText>
          </AddressInfo>
          {selectionMode && <SelectArrow>›</SelectArrow>}
        </AddressItem>
      );
    },
    [handleSelectEntry, addressBook, selectionMode],
  );

  // 현재 탭에 따른 데이터
  const currentData = activeTab === 'favorites' ? favorites : addressBook;

  // FlatList 스타일
  const listContentStyle = { paddingBottom: 20 };

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <Content>
        <Header>
          <Title>주소록</Title>
          {!selectionMode && (
            <AddButton onPress={handleOpenAddModal}>
              <AddButtonText>+ 추가</AddButtonText>
            </AddButton>
          )}
        </Header>

        {/* 탭 전환 */}
        <TabContainer>
          <Tab
            $active={activeTab === 'addressBook'}
            onPress={() => setActiveTab('addressBook')}
          >
            <TabText $active={activeTab === 'addressBook'}>주소록</TabText>
          </Tab>
          <Tab
            $active={activeTab === 'favorites'}
            onPress={() => setActiveTab('favorites')}
          >
            <TabText $active={activeTab === 'favorites'}>즐겨찾기</TabText>
          </Tab>
          <Tab
            $active={activeTab === 'recent'}
            onPress={() => setActiveTab('recent')}
          >
            <TabText $active={activeTab === 'recent'}>최근</TabText>
          </Tab>
        </TabContainer>

        {isLoading ? (
          <LoadingIndicator>
            <ActivityIndicator size="large" color="#007AFF" />
          </LoadingIndicator>
        ) : activeTab === 'recent' ? (
          recentAddresses.length > 0 ? (
            <FlatList
              data={recentAddresses}
              keyExtractor={item => `${item.address}-${item.lastUsed}`}
              renderItem={renderRecentItem}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={listContentStyle}
            />
          ) : (
            <EmptyState>
              <EmptyIcon>🕐</EmptyIcon>
              <EmptyText>최근 사용한 주소가 없습니다</EmptyText>
              <EmptySubText>송금 시 자동으로 기록됩니다</EmptySubText>
            </EmptyState>
          )
        ) : currentData && currentData.length > 0 ? (
          <FlatList
            data={currentData}
            keyExtractor={item => item.id}
            renderItem={renderAddressItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={listContentStyle}
          />
        ) : (
          <EmptyState>
            <EmptyIcon>📋</EmptyIcon>
            <EmptyText>저장된 주소가 없습니다</EmptyText>
            <EmptySubText>자주 사용하는 주소를 추가해보세요</EmptySubText>
          </EmptyState>
        )}
      </Content>

      {/* 주소 추가/편집 모달 */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
      >
        <ModalContainer>
          <ModalHeader>
            <ModalTitle>{editingEntry ? '주소 편집' : '주소 추가'}</ModalTitle>
            <CloseButton onPress={() => setShowModal(false)}>
              <CloseButtonText>✕</CloseButtonText>
            </CloseButton>
          </ModalHeader>

          <ModalContent>
            <InputGroup>
              <InputLabel>이름 *</InputLabel>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="예: 친구 지갑"
                placeholderTextColor="#666"
                maxLength={30}
              />
            </InputGroup>

            <InputGroup>
              <InputLabel>주소 *</InputLabel>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="0x..."
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </InputGroup>

            <InputGroup>
              <InputLabel>메모 (선택)</InputLabel>
              <TextInput
                value={memo}
                onChangeText={setMemo}
                placeholder="메모를 입력하세요"
                placeholderTextColor="#666"
                multiline
                maxLength={100}
              />
            </InputGroup>

            <SaveButton onPress={handleSave} disabled={isSaving}>
              <SaveButtonContent>
                <SaveButtonText>
                  {editingEntry ? '수정' : '추가'}
                </SaveButtonText>
                {isSaving && <LoadingSpinner size="small" color="#fff" />}
              </SaveButtonContent>
            </SaveButton>
          </ModalContent>
        </ModalContainer>
      </Modal>
    </Container>
  );
}

// Styled Components
const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Content = styled.View`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const Header = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const Title = styled.Text`
  font-size: 28px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const AddButton = styled(TouchableOpacity)`
  background-color: ${({ theme }) => theme.colors.primary};
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
`;

const AddButtonText = styled.Text`
  color: #fff;
  font-weight: 600;
`;

const TabContainer = styled.View`
  flex-direction: row;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: 4px;
`;

const Tab = styled(TouchableOpacity)<{ $active: boolean }>`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  align-items: center;
  background-color: ${({ $active, theme }) =>
    $active ? theme.colors.primary : 'transparent'};
`;

const TabText = styled.Text<{ $active: boolean }>`
  color: ${({ $active, theme }) =>
    $active ? '#fff' : theme.colors.textSecondary};
  font-weight: 600;
`;

const AddressItem = styled(TouchableOpacity)`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const AddressInfo = styled.View`
  flex: 1;
`;

const NameRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: 4px;
`;

const AddressName = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const FavoriteIcon = styled.Text`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.primary};
  margin-left: 4px;
`;

const AddressText = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-family: monospace;
`;

const MemoText = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 4px;
`;

const ActionButtons = styled.View`
  flex-direction: row;
  gap: 8px;
`;

const ActionButton = styled(TouchableOpacity)`
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.sm}px;
`;

const ActionButtonText = styled.Text<{ $danger?: boolean }>`
  color: ${({ $danger, theme }) =>
    $danger ? theme.colors.error : theme.colors.primary};
  font-size: 14px;
`;

const SelectArrow = styled.Text`
  font-size: 24px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const EmptyState = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
`;

const EmptyIcon = styled.Text`
  font-size: 48px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const EmptyText = styled.Text`
  font-size: 18px;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const EmptySubText = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// Modal Styles
const ModalContainer = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const ModalHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const ModalTitle = styled.Text`
  font-size: 20px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CloseButton = styled(TouchableOpacity)`
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const CloseButtonText = styled.Text`
  font-size: 20px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ModalContent = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const InputGroup = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const InputLabel = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const TextInput = styled.TextInput`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
`;

const SaveButton = styled(TouchableOpacity)`
  background-color: ${({ theme }) => theme.colors.primary};
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
`;

const SaveButtonContent = styled.View`
  flex-direction: row;
  align-items: center;
`;

const SaveButtonText = styled.Text`
  color: #fff;
  font-size: 16px;
  font-weight: 600;
`;

const LoadingSpinner = styled(ActivityIndicator)`
  margin-left: 8px;
`;

const LoadingIndicator = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
`;

export default AddressBookScreen;
