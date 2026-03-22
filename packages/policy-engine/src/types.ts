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

// ============ WDK Compatible Types ============

export interface EvmTransaction {
  to: string;
  value: number | bigint;
  data?: string;
  gasLimit?: number | bigint;
  gasPrice?: number | bigint;
  maxFeePerGas?: number | bigint;
  maxPriorityFeePerGas?: number | bigint;
}

export interface TransferOptions {
  token: string;
  recipient: string;
  amount: number | bigint;
}

export interface TransactionResult {
  hash: string;
  fee: bigint;
}

export interface IWalletAccount {
  getAddress(): Promise<string>;
  getBalance(): Promise<bigint>;
  getTokenBalance(tokenAddress: string): Promise<bigint>;
  getTokenBalances(tokenAddresses: string[]): Promise<Record<string, bigint>>;
  sendTransaction(tx: EvmTransaction): Promise<TransactionResult>;
  quoteSendTransaction(tx: EvmTransaction): Promise<{ fee: bigint }>;
  transfer(options: TransferOptions): Promise<TransactionResult>;
  quoteTransfer(options: TransferOptions): Promise<{ fee: bigint }>;
  sign(message: string): Promise<string>;
  verify(message: string, signature: string): Promise<boolean>;
  dispose(): void;
  index: number;
  path: string;
  keyPair: { privateKey: Uint8Array | null; publicKey: Uint8Array };
}

export interface IWrappableAccount {
  getAddress(): Promise<string>;
  getBalance(): Promise<bigint>;
  getTokenBalance(tokenAddress: string): Promise<bigint>;
  sendTransaction(tx: EvmTransaction): Promise<TransactionResult>;
  quoteSendTransaction(tx: EvmTransaction): Promise<{ fee: bigint }>;
  transfer(options: TransferOptions): Promise<TransactionResult>;
  quoteTransfer(options: TransferOptions): Promise<{ fee: bigint }>;
  sign(message: string): Promise<string>;
  dispose(): void;
}

// ============ Wallet Config ============

export interface PolicyWalletConfig {
  underlying: IWalletAccount | null;
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
