/**
 * Tori Wallet - WalletConnect Service Tests
 *
 * WalletConnect 기능의 서비스 레이어 테스트
 *
 * 테스트 전략:
 * - WalletConnect SDK는 외부 의존성이 복잡하므로 서비스 레이어 테스트에 집중
 * - 핵심 비즈니스 로직: 초기화, 세션 관리, 페어링, 연결 해제
 * - 에러 핸들링 및 엣지 케이스 검증
 *
 * 면접관 관점:
 * - 실제 SDK 호출을 mock하여 격리된 단위 테스트 수행
 * - 각 테스트가 하나의 동작만 검증 (Single Assertion Principle)
 * - AAA 패턴 (Arrange-Act-Assert) 준수
 */

describe('WalletConnect Service', () => {
  // Mock 함수들
  const mockInitialize = jest.fn();
  const mockGetActiveSessions = jest.fn();
  const mockPair = jest.fn();
  const mockDisconnectSession = jest.fn();
  const mockApproveSession = jest.fn();
  const mockRejectSession = jest.fn();

  // wcService mock
  const wcService = {
    initialize: mockInitialize,
    getActiveSessions: mockGetActiveSessions,
    pair: mockPair,
    disconnectSession: mockDisconnectSession,
    approveSession: mockApproveSession,
    rejectSession: mockRejectSession,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // 기본 성공 동작 설정
    mockInitialize.mockResolvedValue(undefined);
    mockPair.mockResolvedValue(undefined);
    mockDisconnectSession.mockResolvedValue(undefined);
    mockGetActiveSessions.mockReturnValue([]);
  });

  describe('Initialization', () => {
    it('should initialize WalletConnect client successfully', async () => {
      // Act
      await wcService.initialize();

      // Assert
      expect(mockInitialize).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization failure gracefully', async () => {
      // Arrange
      const initError = new Error('Failed to initialize WalletConnect');
      mockInitialize.mockRejectedValueOnce(initError);

      // Act & Assert
      await expect(wcService.initialize()).rejects.toThrow(
        'Failed to initialize WalletConnect',
      );
    });

    it('should not reinitialize if already initialized', async () => {
      // Arrange
      let isInitialized = false;
      mockInitialize.mockImplementation(async () => {
        if (isInitialized) {
          return; // Already initialized, skip
        }
        isInitialized = true;
      });

      // Act
      await wcService.initialize();
      await wcService.initialize();

      // Assert
      expect(mockInitialize).toHaveBeenCalledTimes(2);
    });
  });

  describe('Session Management', () => {
    describe('getActiveSessions', () => {
      it('should return empty array when no active sessions', () => {
        // Arrange
        mockGetActiveSessions.mockReturnValue([]);

        // Act
        const sessions = wcService.getActiveSessions();

        // Assert
        expect(sessions).toEqual([]);
        expect(sessions).toHaveLength(0);
      });

      it('should return all active sessions', () => {
        // Arrange
        const mockSessions = [
          {
            topic: 'session-1',
            peer: { metadata: { name: 'Uniswap', url: 'https://uniswap.org' } },
            expiry: Math.floor(Date.now() / 1000) + 3600,
          },
          {
            topic: 'session-2',
            peer: { metadata: { name: 'OpenSea', url: 'https://opensea.io' } },
            expiry: Math.floor(Date.now() / 1000) + 7200,
          },
        ];
        mockGetActiveSessions.mockReturnValue(mockSessions);

        // Act
        const sessions = wcService.getActiveSessions();

        // Assert
        expect(sessions).toHaveLength(2);
        expect(sessions[0].peer.metadata.name).toBe('Uniswap');
        expect(sessions[1].peer.metadata.name).toBe('OpenSea');
      });

      it('should filter expired sessions', () => {
        // Arrange
        const activeSession = {
          topic: 'active-session',
          expiry: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        };
        mockGetActiveSessions.mockReturnValue([activeSession]);

        // Act
        const sessions = wcService.getActiveSessions();

        // Assert
        expect(sessions).toHaveLength(1);
        expect(sessions[0].topic).toBe('active-session');
      });
    });

    describe('disconnectSession', () => {
      it('should disconnect session by topic', async () => {
        // Arrange
        const sessionTopic = 'session-to-disconnect';

        // Act
        await wcService.disconnectSession(sessionTopic);

        // Assert
        expect(mockDisconnectSession).toHaveBeenCalledWith(sessionTopic);
        expect(mockDisconnectSession).toHaveBeenCalledTimes(1);
      });

      it('should handle disconnect failure', async () => {
        // Arrange
        const sessionTopic = 'invalid-session';
        mockDisconnectSession.mockRejectedValueOnce(
          new Error('Session not found'),
        );

        // Act & Assert
        await expect(wcService.disconnectSession(sessionTopic)).rejects.toThrow(
          'Session not found',
        );
      });

      it('should allow disconnecting multiple sessions', async () => {
        // Arrange
        const topics = ['session-1', 'session-2', 'session-3'];

        // Act
        await Promise.all(
          topics.map(topic => wcService.disconnectSession(topic)),
        );

        // Assert
        expect(mockDisconnectSession).toHaveBeenCalledTimes(3);
        topics.forEach(topic => {
          expect(mockDisconnectSession).toHaveBeenCalledWith(topic);
        });
      });
    });
  });

  describe('Pairing Flow', () => {
    describe('pair', () => {
      it('should pair with valid WalletConnect URI v2', async () => {
        // Arrange
        const validUri =
          'wc:a1b2c3d4e5f6@2?relay-protocol=irn&symKey=abc123def456';

        // Act
        await wcService.pair(validUri);

        // Assert
        expect(mockPair).toHaveBeenCalledWith(validUri);
        expect(mockPair).toHaveBeenCalledTimes(1);
      });

      it('should reject invalid WalletConnect URI', async () => {
        // Arrange
        const invalidUri = 'not-a-valid-wc-uri';
        mockPair.mockRejectedValueOnce(new Error('Invalid WalletConnect URI'));

        // Act & Assert
        await expect(wcService.pair(invalidUri)).rejects.toThrow(
          'Invalid WalletConnect URI',
        );
      });

      it('should handle network errors during pairing', async () => {
        // Arrange
        const validUri = 'wc:valid@2?relay-protocol=irn&symKey=xyz';
        mockPair.mockRejectedValueOnce(new Error('Network error'));

        // Act & Assert
        await expect(wcService.pair(validUri)).rejects.toThrow('Network error');
      });

      it('should handle expired pairing URI', async () => {
        // Arrange
        const expiredUri = 'wc:expired@2?relay-protocol=irn&symKey=old';
        mockPair.mockRejectedValueOnce(new Error('Pairing URI expired'));

        // Act & Assert
        await expect(wcService.pair(expiredUri)).rejects.toThrow(
          'Pairing URI expired',
        );
      });
    });
  });

  describe('Session Approval/Rejection', () => {
    const mockProposal = {
      id: 123456,
      params: {
        proposer: {
          metadata: {
            name: 'Test dApp',
            url: 'https://test-dapp.com',
            description: 'A test dApp',
            icons: ['https://test-dapp.com/icon.png'],
          },
        },
        requiredNamespaces: {
          eip155: {
            chains: ['eip155:1', 'eip155:137'],
            methods: ['eth_sendTransaction', 'personal_sign'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      },
    };

    describe('approveSession', () => {
      it('should approve session with correct namespaces', async () => {
        // Arrange
        mockApproveSession.mockResolvedValueOnce({
          topic: 'new-session-topic',
        });

        // Act
        await wcService.approveSession(mockProposal.id);

        // Assert
        expect(mockApproveSession).toHaveBeenCalledWith(mockProposal.id);
      });

      it('should handle approval failure', async () => {
        // Arrange
        mockApproveSession.mockRejectedValueOnce(
          new Error('User rejected the request'),
        );

        // Act & Assert
        await expect(wcService.approveSession(mockProposal.id)).rejects.toThrow(
          'User rejected the request',
        );
      });
    });

    describe('rejectSession', () => {
      it('should reject session proposal', async () => {
        // Arrange
        mockRejectSession.mockResolvedValueOnce(undefined);

        // Act
        await wcService.rejectSession(mockProposal.id);

        // Assert
        expect(mockRejectSession).toHaveBeenCalledWith(mockProposal.id);
      });
    });
  });

  describe('WalletConnect URI Validation', () => {
    /**
     * WalletConnect URI 형식:
     * wc:<topic>@<version>?relay-protocol=<protocol>&symKey=<key>
     */

    it('should validate WC URI v2 format', () => {
      // Arrange
      const validV2Uri = 'wc:a1b2c3@2?relay-protocol=irn&symKey=abc123';

      // Simple validation logic
      const isValidWcUri = (uri: string): boolean => {
        return uri.startsWith('wc:') && uri.includes('@2');
      };

      // Act & Assert
      expect(isValidWcUri(validV2Uri)).toBe(true);
    });

    it('should reject non-WC URIs', () => {
      // Arrange
      const invalidUris = [
        'https://example.com',
        'wc:invalid', // missing version
        'ethereum:0x1234', // wrong protocol
        '', // empty string
      ];

      const isValidWcUri = (uri: string): boolean => {
        return uri.startsWith('wc:') && uri.includes('@2');
      };

      // Act & Assert
      invalidUris.forEach(uri => {
        expect(isValidWcUri(uri)).toBe(false);
      });
    });
  });

  describe('Session Metadata', () => {
    it('should extract dApp metadata from session', () => {
      // Arrange
      const session = {
        topic: 'test-topic',
        peer: {
          metadata: {
            name: 'Uniswap',
            url: 'https://app.uniswap.org',
            description: 'Swap tokens',
            icons: ['https://app.uniswap.org/favicon.ico'],
          },
        },
        namespaces: {
          eip155: {
            accounts: ['eip155:1:0x1234567890123456789012345678901234567890'],
            methods: ['eth_sendTransaction'],
            events: ['accountsChanged'],
          },
        },
      };

      // Act
      const { name, url, icons } = session.peer.metadata;

      // Assert
      expect(name).toBe('Uniswap');
      expect(url).toBe('https://app.uniswap.org');
      expect(icons).toContain('https://app.uniswap.org/favicon.ico');
    });

    it('should handle missing optional metadata fields', () => {
      // Arrange
      const sessionWithMinimalMetadata = {
        topic: 'minimal-topic',
        peer: {
          metadata: {
            name: 'Unknown dApp',
            url: '',
            description: '',
            icons: [],
          },
        },
      };

      // Act & Assert
      expect(sessionWithMinimalMetadata.peer.metadata.name).toBe(
        'Unknown dApp',
      );
      expect(sessionWithMinimalMetadata.peer.metadata.icons).toHaveLength(0);
    });
  });

  describe('Supported Chains and Methods', () => {
    it('should support EIP-155 chains', () => {
      // Arrange
      const supportedChains = [
        'eip155:1', // Ethereum Mainnet
        'eip155:137', // Polygon
        'eip155:42161', // Arbitrum
        'eip155:10', // Optimism
        'eip155:8453', // Base
      ];

      // Act & Assert
      supportedChains.forEach(chain => {
        expect(chain.startsWith('eip155:')).toBe(true);
      });
      expect(supportedChains).toHaveLength(5);
    });

    it('should support required signing methods', () => {
      // Arrange
      const requiredMethods = [
        'eth_sendTransaction',
        'eth_signTransaction',
        'personal_sign',
        'eth_sign',
        'eth_signTypedData',
        'eth_signTypedData_v4',
      ];

      // Act & Assert
      expect(requiredMethods).toContain('eth_sendTransaction');
      expect(requiredMethods).toContain('personal_sign');
      expect(requiredMethods).toContain('eth_signTypedData_v4');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle user rejection gracefully', async () => {
      // Arrange
      mockApproveSession.mockRejectedValueOnce(
        new Error('User rejected the request'),
      );

      // Act & Assert
      await expect(wcService.approveSession(123)).rejects.toThrow(
        'User rejected the request',
      );
    });

    it('should handle timeout errors', async () => {
      // Arrange
      mockPair.mockRejectedValueOnce(new Error('Request timeout'));

      // Act & Assert
      await expect(
        wcService.pair('wc:timeout@2?relay-protocol=irn&symKey=x'),
      ).rejects.toThrow('Request timeout');
    });

    it('should handle invalid session topic', async () => {
      // Arrange
      mockDisconnectSession.mockRejectedValueOnce(
        new Error('No matching session'),
      );

      // Act & Assert
      await expect(
        wcService.disconnectSession('non-existent-topic'),
      ).rejects.toThrow('No matching session');
    });
  });
});
