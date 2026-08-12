declare module 'react-native-config' {
  export interface NativeConfig {
    WALLETCONNECT_PROJECT_ID?: string;
    SWAP_API_BASE_URL?: string;
    ALCHEMY_API_KEY?: string;
    INFURA_API_KEY?: string;
    COINGECKO_API_KEY?: string;
  }

  export const Config: NativeConfig;
  export default Config;
}
