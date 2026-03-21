/**
 * Protocol-specific policy configurations.
 *
 * Pre-built function selector allowlists for common DeFi protocols.
 * Use with session key function permissions to restrict agents
 * to specific protocol interactions only.
 */

// Common ERC-20 function selectors
export const ERC20_SELECTORS = {
  transfer: '0xa9059cbb' as const,         // transfer(address,uint256)
  approve: '0x095ea7b3' as const,          // approve(address,uint256)
  transferFrom: '0x23b872dd' as const,     // transferFrom(address,address,uint256)
};

// Aave V3 Pool selectors
export const AAVE_V3_SELECTORS = {
  supply: '0x617ba037' as const,           // supply(address,uint256,address,uint16)
  withdraw: '0x69328dec' as const,         // withdraw(address,uint256,address)
  borrow: '0xa415bcad' as const,           // borrow(address,uint256,uint256,uint16,address)
  repay: '0x573ade81' as const,            // repay(address,uint256,uint256,address)
};

// Uniswap V3 Router selectors
export const UNISWAP_V3_SELECTORS = {
  exactInputSingle: '0x414bf389' as const, // exactInputSingle(ExactInputSingleParams)
  exactInput: '0xc04b8d59' as const,       // exactInput(ExactInputParams)
  exactOutputSingle: '0xdb3e2198' as const,// exactOutputSingle(ExactOutputSingleParams)
};

// Protocol policy templates
export interface ProtocolPolicy {
  name: string;
  description: string;
  allowedSelectors: readonly string[];
  blockedSelectors?: readonly string[];
  maxValuePerCall?: bigint;
}

/** Transfer-only: only ERC-20 transfers, no approvals or complex interactions */
export const TRANSFER_ONLY: ProtocolPolicy = {
  name: 'Transfer Only',
  description: 'Only allow ERC-20 transfer() calls. Block approve, transferFrom, and all contract interactions.',
  allowedSelectors: [ERC20_SELECTORS.transfer],
};

/** Aave Supply Only: can supply and withdraw, cannot borrow */
export const AAVE_SUPPLY_ONLY: ProtocolPolicy = {
  name: 'Aave Supply Only',
  description: 'Allow supply and withdraw on Aave V3. Block borrow to prevent leverage risk.',
  allowedSelectors: [
    AAVE_V3_SELECTORS.supply,
    AAVE_V3_SELECTORS.withdraw,
    ERC20_SELECTORS.approve, // needed for Aave supply
  ],
  blockedSelectors: [AAVE_V3_SELECTORS.borrow],
};

/** Aave Full: supply, withdraw, borrow, repay */
export const AAVE_FULL: ProtocolPolicy = {
  name: 'Aave Full',
  description: 'Full Aave V3 access: supply, withdraw, borrow, repay.',
  allowedSelectors: [
    ...Object.values(AAVE_V3_SELECTORS),
    ERC20_SELECTORS.approve,
  ],
};

/** Uniswap Swap Only: single-hop swaps only */
export const UNISWAP_SWAP_ONLY: ProtocolPolicy = {
  name: 'Uniswap Swap Only',
  description: 'Allow single-hop swaps on Uniswap V3. Block multi-hop to limit MEV exposure.',
  allowedSelectors: [
    UNISWAP_V3_SELECTORS.exactInputSingle,
    UNISWAP_V3_SELECTORS.exactOutputSingle,
    ERC20_SELECTORS.approve,
  ],
};

/** Read-only: no write operations allowed (for monitoring agents) */
export const READ_ONLY: ProtocolPolicy = {
  name: 'Read Only',
  description: 'No write operations allowed. Agent can only observe, not transact.',
  allowedSelectors: [],
};

/**
 * Get all pre-built protocol policies.
 */
export function getAllProtocolPolicies(): ProtocolPolicy[] {
  return [
    TRANSFER_ONLY,
    AAVE_SUPPLY_ONLY,
    AAVE_FULL,
    UNISWAP_SWAP_ONLY,
    READ_ONLY,
  ];
}
