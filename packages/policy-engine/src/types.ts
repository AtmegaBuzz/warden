// ============ Core Policy Types ============

export interface AgentPolicy {
  agentId: string;
  maxPerTx: bigint;
  dailyLimit: bigint;
  weeklyLimit?: bigint;
  monthlyLimit?: bigint;
  requireApprovalAbove: bigint;
  allowedTokens: string[];
  blockedTokens: string[];
  allowedRecipients: string[];
  blockedRecipients: string[];
  allowedChains: string[];
  cooldownMs: number;
  minPerTx?: bigint;
  maxTxPerDay?: number;

  anomalyDetection?: AnomalyDetectionConfig;
  activeHoursUTC?: { start: number; end: number };
  velocityRampUp?: VelocityRampUpConfig;
  tieredAuthorization?: TieredAuthorizationConfig;

  sessionKey?: {
    address: string;
    validUntil: number;
    maxUses?: number;
  };

  defiPolicy?: DefiPolicyConfig;

  perTokenLimits?: Record<string, bigint>;
}

export interface AnomalyDetectionConfig {
  maxTxPerHour: number;
  maxRecipientsPerHour: number;
  largeTransactionPct: number;
  burstWindowMs?: number;
  burstThreshold?: number;
  escalationWindowSize?: number;
  recipientConcentrationPct?: number;
  recipientNoveltyPct?: number;
  deviationMultiplier?: number;
}

export interface VelocityRampUpConfig {
  initialMaxPerTx: bigint;
  finalMaxPerTx: bigint;
  rampDays: number;
  createdAt: number;
}

export interface TieredAuthorizationConfig {
  tiers: AuthorizationTier[];
}

export interface AuthorizationTier {
  maxValue: bigint;
  action: 'auto_approve' | 'cooldown_check' | 'require_approval' | 'require_multisig';
  cooldownMs?: number;
}

export interface DefiPolicyConfig {
  maxSupplyPerTx: bigint;
  maxBorrowPerTx: bigint;
  minHealthFactor: number;
  allowedSupplyTokens: string[];
  allowedBorrowTokens: string[];
}

// ============ Risk Scoring ============

export interface RiskFactors {
  valueRatio: number;
  dailyBurnRate: number;
  recipientNovelty: number;
  velocityFactor: number;
  timingFactor: number;
  escalationFactor: number;
  concentrationFactor: number;
  deviationFactor: number;
}

// ============ Policy Decision ============

export interface PolicyDecision {
  approved: boolean;
  reason: string;
  ruleTriggered: string | null;
  timestamp: number;
  agentId: string;
  riskScore?: number;
  riskFactors?: RiskFactors;
  tieredAction?: string;
  transactionDetails: {
    to: string;
    value: bigint;
    token?: string;
    chain: string;
  };
}

// ============ Audit ============

export interface AuditEntry extends PolicyDecision {
  txHash?: string;
  blockNumber?: number;
  gasUsed?: bigint;
}

// ============ Wallet Config ============

export interface PolicyWalletConfig {
  underlying: unknown;
  provider: string;
  policy: AgentPolicy;
  policyDelegateAddress?: string;
  onAuditLog?: (entry: AuditEntry) => void | Promise<void>;
  onApprovalRequired?: (decision: PolicyDecision) => Promise<boolean>;
  transferMaxFee?: bigint;
}

// ============ Internal State ============

export interface SpendingTracker {
  spent: bigint;
  windowStart: number;
  lastTxTimestamp: number;
  txTimestamps: number[];
  recentRecipients: string[];
  recentAmounts: bigint[];
  txCount: number;
  weeklySpent: bigint;
  weeklyWindowStart: number;
  monthlySpent: bigint;
  monthlyWindowStart: number;
  recipientSpendMap: Record<string, bigint>;
}
