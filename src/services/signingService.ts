/**
 * Tori Wallet - Signing Service
 * WalletConnect 서명 요청 처리
 */

import { Buffer } from '../utils/polyfills';
import {
  createWalletClient,
  http,
  hexToString,
  type TransactionSerializable,
} from 'viem';
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import {
  mainnet,
  sepolia,
  polygon,
  arbitrum,
  optimism,
  base,
} from 'viem/chains';
import { walletService } from './walletService';
import { createLogger } from '@/utils/logger';

const logger = createLogger('Signing');

// 지원하는 체인
const CHAINS = {
  1: mainnet,
  11155111: sepolia,
  137: polygon,
  42161: arbitrum,
  10: optimism,
  8453: base,
} as const;

// RPC URLs
const RPC_URLS: Record<number, string> = {
  1: 'https://ethereum-rpc.publicnode.com',
  11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
  137: 'https://polygon-bor-rpc.publicnode.com',
  42161: 'https://arbitrum-one-rpc.publicnode.com',
  10: 'https://optimism-rpc.publicnode.com',
  8453: 'https://base-rpc.publicnode.com',
};

interface TransactionParams {
  from: string;
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
}

class SigningService {
  /**
   * 트랜잭션 서명 및 전송 (eth_sendTransaction)
   */
  async sendTransaction(
    params: TransactionParams,
    chainId: number,
  ): Promise<string> {
    const privateKey = await this.getPrivateKey();
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    const chain = CHAINS[chainId as keyof typeof CHAINS];
    const rpcUrl = RPC_URLS[chainId];

    if (!chain || !rpcUrl) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    // 트랜잭션 파라미터 변환
    // Note: viem의 SendTransactionParameters는 복잡한 조건부 타입으로,
    // gasPrice와 maxFeePerGas가 상호 배타적이어야 함
    const txParams = {
      account,
      to: params.to as `0x${string}`,
      value: params.value ? BigInt(params.value) : undefined,
      data: params.data as `0x${string}` | undefined,
      gas: params.gas ? BigInt(params.gas) : undefined,
      ...(params.gasPrice
        ? { gasPrice: BigInt(params.gasPrice) }
        : {
            maxFeePerGas: params.maxFeePerGas
              ? BigInt(params.maxFeePerGas)
              : undefined,
            maxPriorityFeePerGas: params.maxPriorityFeePerGas
              ? BigInt(params.maxPriorityFeePerGas)
              : undefined,
          }),
      nonce: params.nonce ? parseInt(params.nonce, 16) : undefined,
    };

    // 트랜잭션 전송
    // Type assertion needed due to viem's complex conditional types for gas pricing
    const hash = await walletClient.sendTransaction(
      txParams as Parameters<typeof walletClient.sendTransaction>[0],
    );

    logger.info('Transaction sent:', hash);
    return hash;
  }

  /**
   * 트랜잭션 서명만 (eth_signTransaction)
   */
  async signTransaction(
    params: TransactionParams,
    chainId: number,
  ): Promise<string> {
    const privateKey = await this.getPrivateKey();
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    const chain = CHAINS[chainId as keyof typeof CHAINS];

    if (!chain) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }

    const txParams: TransactionSerializable = {
      to: params.to as `0x${string}`,
      value: params.value ? BigInt(params.value) : undefined,
      data: params.data as `0x${string}` | undefined,
      chainId,
    };

    if (params.gas) {
      txParams.gas = BigInt(params.gas);
    }
    if (params.gasPrice) {
      txParams.gasPrice = BigInt(params.gasPrice);
    }
    if (params.nonce) {
      txParams.nonce = parseInt(params.nonce, 16);
    }

    const signedTx = await account.signTransaction(txParams);

    logger.info('Transaction signed');
    return signedTx;
  }

  /**
   * 개인 메시지 서명 (personal_sign)
   */
  async personalSign(message: string, _address: string): Promise<string> {
    const privateKey = await this.getPrivateKey();
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    // 메시지가 hex인 경우 변환
    let messageToSign: string;
    if (message.startsWith('0x')) {
      try {
        messageToSign = hexToString(message as `0x${string}`);
      } catch {
        messageToSign = message;
      }
    } else {
      messageToSign = message;
    }

    const signature = await account.signMessage({ message: messageToSign });

    logger.info('Personal message signed');
    return signature;
  }

  /**
   * 일반 서명 (eth_sign) - 위험! 일반적으로 사용 안 함
   */
  async ethSign(message: string, _address: string): Promise<string> {
    const privateKey = await this.getPrivateKey();
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    // eth_sign은 raw hash에 서명
    const signature = await account.signMessage({
      message: { raw: message as `0x${string}` },
    });

    logger.info('eth_sign completed');
    return signature;
  }

  /**
   * 타입 데이터 서명 (eth_signTypedData_v4)
   */
  async signTypedData(
    typedData: string | object,
    _address: string,
  ): Promise<string> {
    const privateKey = await this.getPrivateKey();
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    let data: any;
    if (typeof typedData === 'string') {
      try {
        data = JSON.parse(typedData);
      } catch {
        throw new Error('Invalid typed data format');
      }
    } else {
      data = typedData;
    }

    const signature = await account.signTypedData({
      domain: data.domain,
      types: data.types,
      primaryType: data.primaryType,
      message: data.message,
    });

    logger.info('Typed data signed');
    return signature;
  }

  /**
   * WalletConnect 요청 처리
   */
  async handleRequest(
    method: string,
    params: unknown[],
    chainId: number,
  ): Promise<string> {
    logger.debug('Handling request:', { method, params });

    switch (method) {
      case 'eth_sendTransaction': {
        const txParams = params[0] as TransactionParams;
        return this.sendTransaction(txParams, chainId);
      }

      case 'eth_signTransaction': {
        const txParams = params[0] as TransactionParams;
        return this.signTransaction(txParams, chainId);
      }

      case 'personal_sign': {
        // personal_sign: [message, address]
        const message = params[0] as string;
        const address = params[1] as string;
        return this.personalSign(message, address);
      }

      case 'eth_sign': {
        // eth_sign: [address, message]
        const address = params[0] as string;
        const message = params[1] as string;
        return this.ethSign(message, address);
      }

      case 'eth_signTypedData':
      case 'eth_signTypedData_v3':
      case 'eth_signTypedData_v4': {
        // signTypedData: [address, typedData]
        const address = params[0] as string;
        const typedData = params[1] as string | object;
        return this.signTypedData(typedData, address);
      }

      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  /**
   * 개인키 가져오기
   */
  private async getPrivateKey(): Promise<string> {
    // 니모닉에서 개인키 파생
    const mnemonic = await walletService.retrieveMnemonic();

    if (!mnemonic) {
      throw new Error('Failed to retrieve mnemonic. Please authenticate.');
    }

    // 니모닉에서 직접 개인키 파생을 위해 viem 사용
    const hdAccount = mnemonicToAccount(mnemonic, {
      path: "m/44'/60'/0'/0/0" as const,
    });

    // HDAccount의 getHdKey()를 통해 개인키 접근
    const privateKeyBytes = hdAccount.getHdKey().privateKey;
    if (!privateKeyBytes) {
      throw new Error('Failed to derive private key');
    }

    // Uint8Array를 hex string으로 변환
    const privateKey = `0x${Buffer.from(privateKeyBytes).toString('hex')}`;

    return privateKey;
  }
}

export const signingService = new SigningService();
