export interface AgentPolicy {
  agentId: string;
  maxPerTx: bigint;
  dailyLimit: bigint;
  requireApprovalAbove: bigint;
  allowedTokens: string[];
  blockedTokens: string[];
  allowedRecipients: string[];
  blockedRecipients: string[];
  allowedChains: string[];
  cooldownMs: number;

  anomalyDetection?: {
    /** Max transactions per hour before flagging */
    maxTxPerHour: number;
    /** Max unique recipients per hour */
    maxRecipientsPerHour: number;
    /** Flag if single tx is > N% of daily limit */
    largeTransactionPct: number;
  };

  sessionKey?: {
    address: string;
    validUntil: number;
  };
}

export interface PolicyDecision {
  approved: boolean;
  reason: string;
  ruleTriggered: string | null;
  timestamp: number;
  agentId: string;
  riskScore?: number;
  transactionDetails: {
    to: string;
    value: bigint;
    token?: string;
    chain: string;
  };
}

export interface AuditEntry extends PolicyDecision {
  txHash?: string;
  blockNumber?: number;
  gasUsed?: bigint;
}

export interface PolicyWalletConfig {
  underlying: unknown;
  provider: string;
  policy: AgentPolicy;
  policyDelegateAddress?: string;
  onAuditLog?: (entry: AuditEntry) => void | Promise<void>;
  onApprovalRequired?: (decision: PolicyDecision) => Promise<boolean>;
  transferMaxFee?: bigint;
}

export interface SpendingTracker {
  spent: bigint;
  windowStart: number;
  lastTxTimestamp: number;
  txTimestamps: number[];
  recentRecipients: string[];
}
