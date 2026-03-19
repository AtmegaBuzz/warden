/**
 * Pre-built chain configurations for Warden policy enforcement
 * across WDK-supported EVM networks.
 */

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  usdtAddress: string;
  explorerUrl: string;
  isTestnet: boolean;
}

export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  ethereum: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://eth.drpc.org',
    usdtAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    explorerUrl: 'https://etherscan.io',
    isTestnet: false,
  },
  sepolia: {
    chainId: 11155111,
    name: 'Ethereum Sepolia',
    rpcUrl: 'https://rpc.sepolia.org',
    usdtAddress: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
    explorerUrl: 'https://sepolia.etherscan.io',
    isTestnet: true,
  },
  polygon: {
    chainId: 137,
    name: 'Polygon PoS',
    rpcUrl: 'https://polygon-rpc.com',
    usdtAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    explorerUrl: 'https://polygonscan.com',
    isTestnet: false,
  },
  arbitrum: {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    usdtAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    explorerUrl: 'https://arbiscan.io',
    isTestnet: false,
  },
  arbitrumSepolia: {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    usdtAddress: '0x0000000000000000000000000000000000000000',
    explorerUrl: 'https://sepolia.arbiscan.io',
    isTestnet: true,
  },
  bsc: {
    chainId: 56,
    name: 'BNB Smart Chain',
    rpcUrl: 'https://bsc-dataseed.binance.org',
    usdtAddress: '0x55d398326f99059fF775485246999027B3197955',
    explorerUrl: 'https://bscscan.com',
    isTestnet: false,
  },
};

/**
 * Get a chain configuration by name or chain ID.
 */
export function getChainConfig(nameOrId: string | number): ChainConfig | undefined {
  if (typeof nameOrId === 'number') {
    return Object.values(CHAIN_CONFIGS).find(c => c.chainId === nameOrId);
  }
  return CHAIN_CONFIGS[nameOrId];
}

/**
 * Get all supported chain names.
 */
export function getSupportedChains(): string[] {
  return Object.keys(CHAIN_CONFIGS);
}

/**
 * Get only testnet configurations.
 */
export function getTestnetChains(): ChainConfig[] {
  return Object.values(CHAIN_CONFIGS).filter(c => c.isTestnet);
}
