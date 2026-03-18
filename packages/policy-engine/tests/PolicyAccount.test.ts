import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicyAccount, PolicyError } from '../src/PolicyAccount.js';
import type { PolicyWalletConfig, AgentPolicy } from '../src/types.js';

function makePolicy(): AgentPolicy {
  return {
    agentId: 'test-agent',
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

function makeMockAccount() {
  return {
    getAddress: vi.fn().mockResolvedValue('0x1234567890abcdef1234567890abcdef12345678'),
    getBalance: vi.fn().mockResolvedValue(1000_000000n),
    getTokenBalance: vi.fn().mockResolvedValue(500_000000n),
    sendTransaction: vi.fn().mockResolvedValue({ hash: '0xabc', fee: 21000n }),
    transfer: vi.fn().mockResolvedValue({ hash: '0xdef', fee: 50000n }),
    quoteSendTransaction: vi.fn().mockResolvedValue({ fee: 21000n }),
    quoteTransfer: vi.fn().mockResolvedValue({ fee: 50000n }),
    sign: vi.fn().mockResolvedValue('0xsig'),
    dispose: vi.fn(),
  };
}

function makeConfig(policy?: AgentPolicy): PolicyWalletConfig {
  return {
    underlying: null,
    provider: 'https://rpc.sepolia.org',
    policy: policy ?? makePolicy(),
  };
}

describe('PolicyAccount', () => {
  let mockAccount: ReturnType<typeof makeMockAccount>;
  let account: PolicyAccount;

  beforeEach(() => {
    mockAccount = makeMockAccount();
    account = new PolicyAccount(mockAccount, makeConfig(), 'sepolia');
  });

  it('proxies getAddress to inner account', async () => {
    const addr = await account.getAddress();
    expect(addr).toBe('0x1234567890abcdef1234567890abcdef12345678');
  });

  it('proxies getBalance to inner account', async () => {
    const bal = await account.getBalance();
    expect(bal).toBe(1000_000000n);
  });

  it('allows transaction within policy', async () => {
    const result = await account.sendTransaction({
      to: '0xrecipient',
      value: 50_000000n,
    });
    expect(result.hash).toBe('0xabc');
    expect(mockAccount.sendTransaction).toHaveBeenCalledOnce();
  });

  it('blocks transaction exceeding maxPerTx', async () => {
    await expect(
      account.sendTransaction({ to: '0xrecipient', value: 200_000000n })
    ).rejects.toThrow(PolicyError);

    expect(mockAccount.sendTransaction).not.toHaveBeenCalled();
  });

  it('blocks transfer exceeding maxPerTx', async () => {
    await expect(
      account.transfer({ token: '0xtoken', recipient: '0xrecip', amount: 200_000000n })
    ).rejects.toThrow(PolicyError);

    expect(mockAccount.transfer).not.toHaveBeenCalled();
  });

  it('PolicyError contains decision details', async () => {
    try {
      await account.sendTransaction({ to: '0xrecipient', value: 200_000000n });
    } catch (e) {
      expect(e).toBeInstanceOf(PolicyError);
      const pe = e as PolicyError;
      expect(pe.decision.approved).toBe(false);
      expect(pe.decision.ruleTriggered).toBe('maxPerTx');
      expect(pe.decision.agentId).toBe('test-agent');
    }
  });

  it('allows transfer within policy', async () => {
    const result = await account.transfer({
      token: '0xtoken', recipient: '0xrecip', amount: 50_000000n,
    });
    expect(result.hash).toBe('0xdef');
    expect(mockAccount.transfer).toHaveBeenCalledOnce();
  });

  it('calls human approval callback for requireApproval rule', async () => {
    const approvalCallback = vi.fn().mockResolvedValue(true);
    const config = makeConfig({ ...makePolicy(), requireApprovalAbove: 40_000000n });
    config.onApprovalRequired = approvalCallback;
    const acc = new PolicyAccount(mockAccount, config, 'sepolia');

    const result = await acc.sendTransaction({ to: '0xrecip', value: 50_000000n });
    expect(approvalCallback).toHaveBeenCalledOnce();
    expect(result.hash).toBe('0xabc');
  });

  it('blocks when human denies approval', async () => {
    const approvalCallback = vi.fn().mockResolvedValue(false);
    const config = makeConfig({ ...makePolicy(), requireApprovalAbove: 40_000000n });
    config.onApprovalRequired = approvalCallback;
    const acc = new PolicyAccount(mockAccount, config, 'sepolia');

    await expect(
      acc.sendTransaction({ to: '0xrecip', value: 50_000000n })
    ).rejects.toThrow(PolicyError);
  });

  it('tracks spending status', async () => {
    await account.sendTransaction({ to: '0xrecip', value: 50_000000n });
    const status = account.getSpendingStatus();
    expect(status.spent).toBe(50_000000n);
    expect(status.remaining).toBe(450_000000n);
  });

  it('returns audit log', async () => {
    await account.sendTransaction({ to: '0xrecip', value: 50_000000n });
    const log = account.getAuditLog();
    expect(log.length).toBe(1);
    expect(log[0].approved).toBe(true);
  });

  it('returns audit stats', async () => {
    await account.sendTransaction({ to: '0xrecip', value: 50_000000n });
    try { await account.sendTransaction({ to: '0xrecip', value: 200_000000n }); } catch {}
    const stats = account.getAuditStats();
    expect(stats.total).toBe(2);
    expect(stats.approved).toBe(1);
    expect(stats.blocked).toBe(1);
  });

  it('proxies quoteSendTransaction without policy check', async () => {
    const quote = await account.quoteSendTransaction({ to: '0xrecip', value: 999_000000n });
    expect(quote.fee).toBe(21000n);
  });

  it('dispose cleans up inner account', () => {
    account.dispose();
    expect(mockAccount.dispose).toHaveBeenCalledOnce();
  });
});
