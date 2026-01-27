declare module 'react-native-config' {
  export interface NativeConfig {
    WALLETCONNECT_PROJECT_ID?: string;
    ZEROX_API_KEY?: string;
    ALCHEMY_API_KEY?: string;
    INFURA_API_KEY?: string;
    COINGECKO_API_KEY?: string;
  }

  export const Config: NativeConfig;
  export default Config;
}
