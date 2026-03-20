/**
 * Contract interaction risk classification.
 *
 * Classifies smart contracts by risk level based on whether they are
 * known protocols, verified contracts, or newly deployed.
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ContractClassification {
  address: string;
  level: RiskLevel;
  label?: string;
  reason: string;
}

// Well-known protocol addresses (Ethereum mainnet)
const KNOWN_PROTOCOLS: Record<string, { label: string; level: RiskLevel }> = {
  // Aave V3
  '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': { label: 'Aave V3 Pool', level: 'low' },
  // Uniswap V3 Router
  '0xe592427a0aece92de3edee1f18e0157c05861564': { label: 'Uniswap V3 Router', level: 'low' },
  // Uniswap Universal Router
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': { label: 'Uniswap Universal Router', level: 'low' },
  // 1inch Router
  '0x1111111254eeb25477b68fb85ed929f73a960582': { label: '1inch Router', level: 'low' },
  // Curve Router
  '0xf0d4c12a5768d806021f80a262b4d39d26c58b8d': { label: 'Curve Router', level: 'low' },
  // USDT
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { label: 'USDT', level: 'low' },
  // USDC
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { label: 'USDC', level: 'low' },
  // WETH
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { label: 'WETH', level: 'low' },
  // Sepolia USDT
  '0x7169d38820dfd117c3fa1f22a697dba58d90ba06': { label: 'Sepolia USDT', level: 'low' },
};

export class ContractRiskClassifier {
  private customClassifications: Map<string, ContractClassification> = new Map();

  /**
   * Classify a contract by its address.
   */
  classify(address: string): ContractClassification {
    const lower = address.toLowerCase();

    // Check custom classifications first
    const custom = this.customClassifications.get(lower);
    if (custom) return custom;

    // Check known protocols
    const known = KNOWN_PROTOCOLS[lower];
    if (known) {
      return { address: lower, level: known.level, label: known.label, reason: 'Known protocol' };
    }

    // EOA addresses (no code) are medium risk
    // Note: actual code check would need on-chain call
    return { address: lower, level: 'medium', reason: 'Unknown contract' };
  }

  /**
   * Get the maximum transaction value allowed for a given risk level.
   */
  getMaxValueForRisk(level: RiskLevel, baseMaxPerTx: bigint): bigint {
    switch (level) {
      case 'low': return baseMaxPerTx;
      case 'medium': return baseMaxPerTx / 2n;
      case 'high': return baseMaxPerTx / 5n;
      case 'critical': return 0n;
    }
  }

  /**
   * Register a custom classification for a contract.
   */
  registerContract(address: string, level: RiskLevel, label?: string): void {
    const lower = address.toLowerCase();
    this.customClassifications.set(lower, {
      address: lower, level, label, reason: 'Custom classification',
    });
  }

  /**
   * Check if a contract is a known safe protocol.
   */
  isKnownProtocol(address: string): boolean {
    return KNOWN_PROTOCOLS[address.toLowerCase()] !== undefined;
  }
}
