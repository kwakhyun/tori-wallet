/**
 * Tori Wallet - Realm Hooks Index
 */

// Address Book
export {
  useAddressBook,
  useFavoriteAddresses,
  useAddressSearch,
  useAddressName,
} from './useAddressBook';

// Transaction Cache
export {
  useTransactions,
  usePendingTransactions,
  useTransaction,
  useTransactionStatus,
  useCreateLocalTransaction,
  useRecentTransactions,
} from './useTransactionCache';

// Token List
export {
  useTokenList,
  useHiddenTokens,
  useCustomTokens,
  useTokenSearch,
  useLastKnownBalances,
  useTokenUpdate,
} from './useTokenList';

// Sync Status
export {
  useSyncStatus,
  useBalanceSnapshot,
  usePortfolioSnapshots,
  useLastSyncTime,
  useOfflineData,
} from './useSyncStatus';

// User Preferences
export {
  usePreference,
  useCurrency,
  useThemePreference,
  useBiometricPreference,
  useHideBalance,
  useDefaultChain,
  useTestnetPreference,
  useGasPreference,
  useNotificationPreferences,
  useAutoLockTimeout,
  useResetPreferences,
  PREFERENCE_KEYS,
} from './usePreferences';

// WalletConnect Logs
export {
  useWCActiveSessions,
  useWCSessionHistory,
  useWCRequestLog,
  useWCPendingRequests,
  useWCRequestStats,
  useWCDAppHistory,
  useWCLogCleanup,
} from './useWCLog';
