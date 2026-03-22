import { describe, it, expect, vi } from 'vitest';
import { PolicyAccount } from '../src/PolicyAccount.js';
import { PolicyWalletManager } from '../src/PolicyWalletManager.js';
import { wardenMiddleware } from '../src/WardenMiddleware.js';
import type {
  IWalletAccount,
  IWrappableAccount,
  EvmTransaction,
  TransferOptions,
  TransactionResult,
  AgentPolicy,
  AuditEntry,
  PolicyDecision,
  PolicyWalletConfig,
} from '../src/types.js';

function makePolicy(): AgentPolicy {
  return {
    agentId: 'wdk-test-agent',
    maxPerTx: 100_000000n,
    dailyLimit: 500_000000n,
    requireApprovalAbove: 1000_000000n,
    allowedTokens: [],
    blockedTokens: [],
    allowedRecipients: [],
    blockedRecipients: [],
    allowedChains: [],
    cooldownMs: 0,
  };
}

function makeFullWdkMock(): IWalletAccount {
  return {
    getAddress: vi.fn().mockResolvedValue('0xWdkAddress1234567890abcdef12345678'),
    getBalance: vi.fn().mockResolvedValue(2000_000000n),
    getTokenBalance: vi.fn().mockResolvedValue(1000_000000n),
    getTokenBalances: vi.fn().mockResolvedValue({ '0xtoken': 500_000000n }),
    sendTransaction: vi.fn().mockResolvedValue({ hash: '0xtxhash', fee: 21000n }),
    quoteSendTransaction: vi.fn().mockResolvedValue({ fee: 21000n }),
    transfer: vi.fn().mockResolvedValue({ hash: '0xtransferhash', fee: 50000n }),
    quoteTransfer: vi.fn().mockResolvedValue({ fee: 50000n }),
    sign: vi.fn().mockResolvedValue('0xsignature'),
    verify: vi.fn().mockResolvedValue(true),
    dispose: vi.fn(),
    index: 0,
    path: "m/44'/60'/0'/0/0",
    keyPair: {
      privateKey: new Uint8Array(32),
      publicKey: new Uint8Array(65),
    },
  };
}

function makeWrappableMock(): IWrappableAccount {
  return {
    getAddress: vi.fn().mockResolvedValue('0xWrappableAddress1234567890abcdef'),
    getBalance: vi.fn().mockResolvedValue(1000_000000n),
    getTokenBalance: vi.fn().mockResolvedValue(500_000000n),
    sendTransaction: vi.fn().mockResolvedValue({ hash: '0xabc', fee: 21000n }),
    quoteSendTransaction: vi.fn().mockResolvedValue({ fee: 21000n }),
    transfer: vi.fn().mockResolvedValue({ hash: '0xdef', fee: 50000n }),
    quoteTransfer: vi.fn().mockResolvedValue({ fee: 50000n }),
    sign: vi.fn().mockResolvedValue('0xsig'),
    dispose: vi.fn(),
  };
}

describe('WDK Type Integration', () => {
  describe('Interface compatibility', () => {
    it('IWalletAccount mock satisfies IWrappableAccount', () => {
      const fullMock = makeFullWdkMock();
      const wrappable: IWrappableAccount = fullMock;
      expect(wrappable.getAddress).toBeDefined();
      expect(wrappable.sendTransaction).toBeDefined();
      expect(wrappable.transfer).toBeDefined();
      expect(wrappable.sign).toBeDefined();
      expect(wrappable.dispose).toBeDefined();
    });

    it('PolicyAccount accepts IWrappableAccount', async () => {
      const mock = makeWrappableMock();
      const config: PolicyWalletConfig = {
        underlying: null,
        provider: 'https://rpc.sepolia.org',
        policy: makePolicy(),
      };

      const account = new PolicyAccount(mock, config, 'sepolia');
      const address = await account.getAddress();
      expect(address).toBe('0xWrappableAddress1234567890abcdef');
    });

    it('PolicyAccount accepts IWalletAccount (superset of IWrappableAccount)', async () => {
      const mock = makeFullWdkMock();
      const config: PolicyWalletConfig = {
        underlying: mock,
        provider: 'https://rpc.sepolia.org',
        policy: makePolicy(),
      };

      const account = new PolicyAccount(mock, config, 'ethereum');
      const address = await account.getAddress();
      expect(address).toBe('0xWdkAddress1234567890abcdef12345678');
    });

    it('PolicyWalletManager.wrapAccount accepts IWalletAccount', async () => {
      const mock = makeFullWdkMock();
      const manager = new PolicyWalletManager({
        provider: 'https://rpc.sepolia.org',
        policy: makePolicy(),
      });

      const policyAccount = await manager.wrapAccount(mock, 'sepolia');
      const address = await policyAccount.getAddress();
      expect(address).toBe('0xWdkAddress1234567890abcdef12345678');
    });

    it('wardenMiddleware accepts IWalletAccount', async () => {
      const mock = makeFullWdkMock();
      const middleware = wardenMiddleware({
        policy: makePolicy(),
        provider: 'https://rpc.sepolia.org',
      });

      const policyAccount = await middleware(mock);
      const address = await policyAccount.getAddress();
      expect(address).toBe('0xWdkAddress1234567890abcdef12345678');
    });
  });

  describe('EvmTransaction typing', () => {
    it('accepts bigint value in sendTransaction', async () => {
      const mock = makeWrappableMock();
      const config: PolicyWalletConfig = {
        underlying: null,
        provider: 'https://rpc.sepolia.org',
        policy: makePolicy(),
      };
      const account = new PolicyAccount(mock, config, 'sepolia');

      const tx: EvmTransaction = {
        to: '0xrecipient',
        value: 50_000000n,
      };
      const result = await account.sendTransaction(tx);
      expect(result.hash).toBe('0xabc');
    });

    it('accepts number value in sendTransaction', async () => {
      const mock = makeWrappableMock();
      const config: PolicyWalletConfig = {
        underlying: null,
        provider: 'https://rpc.sepolia.org',
        policy: makePolicy(),
      };
      const account = new PolicyAccount(mock, config, 'sepolia');

      const tx: EvmTransaction = {
        to: '0xrecipient',
        value: 50_000000,
      };
      const result = await account.sendTransaction(tx);
      expect(result.hash).toBe('0xabc');
    });

    it('accepts optional gas fields', async () => {
      const mock = makeWrappableMock();
      const config: PolicyWalletConfig = {
        underlying: null,
        provider: 'https://rpc.sepolia.org',
        policy: makePolicy(),
      };
      const account = new PolicyAccount(mock, config, 'sepolia');

      const tx: EvmTransaction = {
        to: '0xrecipient',
        value: 50_000000n,
        data: '0x',
        gasLimit: 21000n,
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 2000000000n,
      };
      const result = await account.sendTransaction(tx);
      expect(result.hash).toBe('0xabc');
    });
  });

  describe('TransferOptions typing', () => {
    it('accepts bigint amount in transfer', async () => {
      const mock = makeWrappableMock();
      const config: PolicyWalletConfig = {
        underlying: null,
        provider: 'https://rpc.sepolia.org',
        policy: makePolicy(),
      };
      const account = new PolicyAccount(mock, config, 'sepolia');

      const opts: TransferOptions = {
        token: '0xtoken',
        recipient: '0xrecipient',
        amount: 50_000000n,
      };
      const result = await account.transfer(opts);
      expect(result.hash).toBe('0xdef');
    });

    it('accepts number amount in transfer', async () => {
      const mock = makeWrappableMock();
      const config: PolicyWalletConfig = {
        underlying: null,
        provider: 'https://rpc.sepolia.org',
        policy: makePolicy(),
      };
      const account = new PolicyAccount(mock, config, 'sepolia');

      const opts: TransferOptions = {
        token: '0xtoken',
        recipient: '0xrecipient',
        amount: 50_000000,
      };
      const result = await account.transfer(opts);
      expect(result.hash).toBe('0xdef');
    });
  });

  describe('TransactionResult typing', () => {
    it('sendTransaction returns TransactionResult', async () => {
      const mock = makeWrappableMock();
      const config: PolicyWalletConfig = {
        underlying: null,
        provider: 'https://rpc.sepolia.org',
        policy: makePolicy(),
      };
      const account = new PolicyAccount(mock, config, 'sepolia');

      const result: TransactionResult = await account.sendTransaction({
        to: '0xrecipient',
        value: 50_000000n,
      });
      expect(result.hash).toBe('0xabc');
      expect(result.fee).toBe(21000n);
    });

    it('transfer returns TransactionResult', async () => {
      const mock = makeWrappableMock();
      const config: PolicyWalletConfig = {
        underlying: null,
        provider: 'https://rpc.sepolia.org',
        policy: makePolicy(),
      };
      const account = new PolicyAccount(mock, config, 'sepolia');

      const result: TransactionResult = await account.transfer({
        token: '0xtoken',
        recipient: '0xrecipient',
        amount: 50_000000n,
      });
      expect(result.hash).toBe('0xdef');
      expect(result.fee).toBe(50000n);
    });
  });

  describe('Callback typing', () => {
    it('onAuditLog receives AuditEntry with proper fields', async () => {
      const auditCallback = vi.fn();
      const mock = makeWrappableMock();
      const config: PolicyWalletConfig = {
        underlying: null,
        provider: 'https://rpc.sepolia.org',
        policy: makePolicy(),
        onAuditLog: auditCallback,
      };
      const account = new PolicyAccount(mock, config, 'sepolia');

      await account.sendTransaction({ to: '0xrecipient', value: 50_000000n });

      expect(auditCallback).toHaveBeenCalledOnce();
      const entry: AuditEntry = auditCallback.mock.calls[0][0];
      expect(entry.approved).toBe(true);
      expect(entry.agentId).toBe('wdk-test-agent');
      expect(entry.transactionDetails.to).toBe('0xrecipient');
    });

    it('onApprovalRequired receives PolicyDecision', async () => {
      const approvalCallback = vi.fn().mockResolvedValue(true);
      const policy = makePolicy();
      policy.requireApprovalAbove = 40_000000n;

      const mock = makeWrappableMock();
      const config: PolicyWalletConfig = {
        underlying: null,
        provider: 'https://rpc.sepolia.org',
        policy,
        onApprovalRequired: approvalCallback,
      };
      const account = new PolicyAccount(mock, config, 'sepolia');

      await account.sendTransaction({ to: '0xrecipient', value: 50_000000n });

      expect(approvalCallback).toHaveBeenCalledOnce();
      const decision: PolicyDecision = approvalCallback.mock.calls[0][0];
      expect(decision.ruleTriggered).toBe('requireApproval');
      expect(decision.transactionDetails.value).toBe(50_000000n);
    });
  });
});
