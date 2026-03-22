import { PolicyAccount } from './PolicyAccount.js';
import type { AgentPolicy, PolicyWalletConfig, AuditEntry, PolicyDecision, IWalletAccount } from './types.js';

export interface WardenMiddlewareConfig {
  policy: AgentPolicy;
  provider: string;
  policyDelegateAddress?: string;
  onAuditLog?: (entry: AuditEntry) => void | Promise<void>;
  onApprovalRequired?: (decision: PolicyDecision) => Promise<boolean>;
}

/**
 * Warden middleware function for WDK.
 *
 * Usage:
 * ```typescript
 * const wdk = new WDK(seed)
 *   .registerWallet('ethereum', WalletManagerEvm, { provider })
 *   .registerMiddleware('ethereum', wardenMiddleware({
 *     policy: myPolicy,
 *     provider: 'https://rpc.sepolia.org',
 *   }));
 * ```
 *
 * When registered, every account access on the specified chain
 * will be transparently wrapped with policy enforcement.
 */
export function wardenMiddleware(config: WardenMiddlewareConfig) {
  return async function middleware<A extends IWalletAccount>(account: A): Promise<PolicyAccount> {
    const walletConfig: PolicyWalletConfig = {
      underlying: account,
      provider: config.provider,
      policy: config.policy,
      policyDelegateAddress: config.policyDelegateAddress,
      onAuditLog: config.onAuditLog,
      onApprovalRequired: config.onApprovalRequired,
    };

    const chain = config.policy.allowedChains?.[0] ?? 'ethereum';

    return new PolicyAccount(
      account,
      walletConfig,
      chain,
    );
  };
}
