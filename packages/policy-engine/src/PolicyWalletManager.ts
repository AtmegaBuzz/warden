import { PolicyEngine } from './PolicyEngine.js';
import { PolicyAccount } from './PolicyAccount.js';
import { AuditLogger } from './AuditLogger.js';
import { EIP7702Manager } from './EIP7702Manager.js';
import type { AgentPolicy, PolicyWalletConfig } from './types.js';

export interface PolicyWalletManagerConfig {
  provider: string;
  policy: AgentPolicy;
  policyDelegateAddress?: string;
  privateKey?: string;
  onAuditLog?: (entry: unknown) => void | Promise<void>;
  onApprovalRequired?: (decision: unknown) => Promise<boolean>;
  transferMaxFee?: bigint;
  chainId?: number;
}

/**
 * PolicyWalletManager wraps any WDK wallet manager to add policy enforcement.
 *
 * Usage with WDK:
 * ```typescript
 * const wdk = new WDK(seed)
 *   .registerWallet('ethereum', WalletManagerEvm, {
 *     provider: 'https://rpc.sepolia.org',
 *   });
 *
 * // Wrap accounts with policy enforcement
 * const manager = new PolicyWalletManager(config);
 * const policyAccount = await manager.wrapAccount(rawAccount, 'sepolia');
 * ```
 */
export class PolicyWalletManager {
  private config: PolicyWalletManagerConfig;
  private eip7702?: EIP7702Manager;
  private accounts: Map<string, PolicyAccount> = new Map();

  constructor(config: PolicyWalletManagerConfig) {
    this.config = config;

    if (config.policyDelegateAddress && config.privateKey) {
      this.eip7702 = new EIP7702Manager({
        providerUrl: config.provider,
        policyDelegateAddress: config.policyDelegateAddress as `0x${string}`,
        privateKey: config.privateKey as `0x${string}`,
        chainId: config.chainId,
      });
    }
  }

  /**
   * Wrap a raw WDK account with policy enforcement.
   * The returned PolicyAccount intercepts all transactions
   * and validates them against the configured policy before execution.
   */
  async wrapAccount(innerAccount: unknown, chain: string = 'ethereum'): Promise<PolicyAccount> {
    const walletConfig: PolicyWalletConfig = {
      underlying: innerAccount,
      provider: this.config.provider,
      policy: this.config.policy,
      policyDelegateAddress: this.config.policyDelegateAddress,
      onAuditLog: this.config.onAuditLog as PolicyWalletConfig['onAuditLog'],
      onApprovalRequired: this.config.onApprovalRequired as PolicyWalletConfig['onApprovalRequired'],
      transferMaxFee: this.config.transferMaxFee,
    };

    const account = new PolicyAccount(
      innerAccount as Parameters<typeof PolicyAccount.prototype['getAddress']> extends never[]
        ? never
        : any,
      walletConfig,
      chain,
      this.eip7702,
    );

    const address = await account.getAddress();
    this.accounts.set(address, account);
    return account;
  }

  /**
   * Get a previously wrapped account by address.
   */
  getAccount(address: string): PolicyAccount | undefined {
    return this.accounts.get(address);
  }

  /**
   * Get all wrapped accounts.
   */
  getAllAccounts(): PolicyAccount[] {
    return Array.from(this.accounts.values());
  }

  /**
   * Get the EIP-7702 manager for direct delegation operations.
   */
  getEIP7702Manager(): EIP7702Manager | undefined {
    return this.eip7702;
  }

  /**
   * Dispose all wrapped accounts and clean up resources.
   */
  dispose(): void {
    for (const account of this.accounts.values()) {
      account.dispose();
    }
    this.accounts.clear();
  }
}
