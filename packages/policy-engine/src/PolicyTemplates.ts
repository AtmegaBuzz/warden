import type { AgentPolicy } from './types.js';

/**
 * Pre-built policy templates for common use cases.
 * These provide sensible defaults that can be customized.
 */

/** Conservative agent — low limits, strict controls */
export function conservativePolicy(agentId: string): AgentPolicy {
  return {
    agentId,
    maxPerTx: 10_000000n,       // 10 USDT
    dailyLimit: 50_000000n,      // 50 USDT
    weeklyLimit: 200_000000n,    // 200 USDT
    monthlyLimit: 500_000000n,   // 500 USDT
    requireApprovalAbove: 8_000000n,
    allowedTokens: [],
    blockedTokens: [],
    allowedRecipients: [],
    blockedRecipients: [],
    allowedChains: ['sepolia'],
    cooldownMs: 60_000,
    minPerTx: 100000n,          // 0.1 USDT min
    maxTxPerDay: 20,
    anomalyDetection: {
      maxTxPerHour: 5,
      maxRecipientsPerHour: 3,
      largeTransactionPct: 40,
      burstThreshold: 3,
      burstWindowMs: 120_000,
      escalationWindowSize: 5,
      recipientConcentrationPct: 60,
      recipientNoveltyPct: 30,
      deviationMultiplier: 2.0,
    },
    activeHoursUTC: { start: 9, end: 17 },
  };
}

/** Moderate agent — balanced limits */
export function moderatePolicy(agentId: string): AgentPolicy {
  return {
    agentId,
    maxPerTx: 100_000000n,      // 100 USDT
    dailyLimit: 500_000000n,     // 500 USDT
    weeklyLimit: 2000_000000n,   // 2,000 USDT
    monthlyLimit: 5000_000000n,  // 5,000 USDT
    requireApprovalAbove: 80_000000n,
    allowedTokens: [],
    blockedTokens: [],
    allowedRecipients: [],
    blockedRecipients: [],
    allowedChains: ['sepolia', 'ethereum'],
    cooldownMs: 30_000,
    maxTxPerDay: 50,
    anomalyDetection: {
      maxTxPerHour: 10,
      maxRecipientsPerHour: 5,
      largeTransactionPct: 50,
      burstThreshold: 5,
      burstWindowMs: 120_000,
      escalationWindowSize: 5,
      recipientConcentrationPct: 70,
      deviationMultiplier: 2.5,
    },
  };
}

/** High-throughput agent — generous limits for active trading */
export function aggressivePolicy(agentId: string): AgentPolicy {
  return {
    agentId,
    maxPerTx: 500_000000n,      // 500 USDT
    dailyLimit: 5000_000000n,    // 5,000 USDT
    weeklyLimit: 20000_000000n,  // 20,000 USDT
    requireApprovalAbove: 400_000000n,
    allowedTokens: [],
    blockedTokens: [],
    allowedRecipients: [],
    blockedRecipients: [],
    allowedChains: [],
    cooldownMs: 10_000,
    maxTxPerDay: 200,
    anomalyDetection: {
      maxTxPerHour: 30,
      maxRecipientsPerHour: 15,
      largeTransactionPct: 60,
      burstThreshold: 10,
      burstWindowMs: 60_000,
      deviationMultiplier: 3.0,
    },
  };
}

/** Transfer-only agent — can only send ERC-20 tokens, no contract interactions */
export function transferOnlyPolicy(agentId: string, allowedTokens: string[]): AgentPolicy {
  return {
    ...moderatePolicy(agentId),
    agentId,
    allowedTokens,
    blockedRecipients: [],
    allowedRecipients: [],
  };
}

/** DeFi agent — allowed to interact with specific protocols */
export function defiPolicy(agentId: string): AgentPolicy {
  return {
    ...moderatePolicy(agentId),
    agentId,
    defiPolicy: {
      maxSupplyPerTx: 1000_000000n,
      maxBorrowPerTx: 500_000000n,
      minHealthFactor: 1.5,
      allowedSupplyTokens: [],
      allowedBorrowTokens: [],
    },
  };
}

/** New session key policy with graduated ramp-up */
export function rampUpPolicy(agentId: string): AgentPolicy {
  return {
    ...conservativePolicy(agentId),
    agentId,
    velocityRampUp: {
      initialMaxPerTx: 5_000000n,    // Start: 5 USDT
      finalMaxPerTx: 100_000000n,    // End: 100 USDT after 30 days
      rampDays: 30,
      createdAt: Date.now(),
    },
  };
}

/** Tiered authorization policy — different approval flows by amount */
export function tieredPolicy(agentId: string): AgentPolicy {
  return {
    ...moderatePolicy(agentId),
    agentId,
    tieredAuthorization: {
      tiers: [
        { maxValue: 50_000000n, action: 'auto_approve' },
        { maxValue: 200_000000n, action: 'cooldown_check', cooldownMs: 30_000 },
        { maxValue: 500_000000n, action: 'require_approval' },
        { maxValue: 5000_000000n, action: 'require_multisig' },
      ],
    },
  };
}
