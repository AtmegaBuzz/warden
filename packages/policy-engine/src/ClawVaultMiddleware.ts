import { PolicyAccount } from './PolicyAccount.js';
import { AuditLogger } from './AuditLogger.js';
import { PolicyEngine } from './PolicyEngine.js';
import type { AgentPolicy, PolicyWalletConfig } from './types.js';

export interface WardenMiddlewareConfig {
  policy: AgentPolicy;
  provider: string;
  policyDelegateAddress?: string;
  onAuditLog?: (entry: unknown) => void | Promise<void>;
  onApprovalRequired?: (decision: unknown) => Promise<boolean>;
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
  return async function middleware(account: unknown): Promise<PolicyAccount> {
    const walletConfig: PolicyWalletConfig = {
      underlying: account,
      provider: config.provider,
      policy: config.policy,
      policyDelegateAddress: config.policyDelegateAddress,
      onAuditLog: config.onAuditLog as PolicyWalletConfig['onAuditLog'],
      onApprovalRequired: config.onApprovalRequired as PolicyWalletConfig['onApprovalRequired'],
    };

    const chain = config.policy.allowedChains?.[0] ?? 'ethereum';

    return new PolicyAccount(
      account as any,
      walletConfig,
      chain,
    );
  };
}
