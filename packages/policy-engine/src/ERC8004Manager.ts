import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const IDENTITY_REGISTRY_ABI = parseAbi([
  'function mintAgent(string memory tokenURI) external returns (uint256)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
]);

const REPUTATION_REGISTRY_ABI = parseAbi([
  'function giveFeedback(uint256 agentId, uint8 score, string memory comment, bytes memory authorization) external',
  'function getAverageScore(uint256 agentId) external view returns (uint256)',
  'function getFeedbackCount(uint256 agentId) external view returns (uint256)',
]);

export interface ERC8004Config {
  providerUrl: string;
  privateKey: Hex;
  identityRegistryAddress: Address;
  reputationRegistryAddress: Address;
  chainId?: number;
}

export class ERC8004Manager {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private account: ReturnType<typeof privateKeyToAccount>;
  private identityRegistry: Address;
  private reputationRegistry: Address;

  constructor(config: ERC8004Config) {
    this.account = privateKeyToAccount(config.privateKey);
    this.identityRegistry = config.identityRegistryAddress;
    this.reputationRegistry = config.reputationRegistryAddress;

    const chain = sepolia;
    this.publicClient = createPublicClient({
      chain,
      transport: http(config.providerUrl, { timeout: 15000 }),
    });
    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport: http(config.providerUrl, { timeout: 15000 }),
    });
  }

  get address(): Address {
    return this.account.address;
  }

  async registerAgent(metadataUri: string): Promise<{ agentId: bigint; txHash: Hex }> {
    try {
      const data = encodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'mintAgent',
        args: [metadataUri],
      });

      const hash = await this.walletClient.sendTransaction({
        account: this.account,
        chain: sepolia,
        to: this.identityRegistry,
        data,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'reverted') {
        throw new Error('Transaction reverted');
      }
      // ERC-721 Transfer event emits tokenId as the third indexed topic
      const transferLog = receipt.logs[0];
      const agentId = transferLog?.topics[3]
        ? BigInt(transferLog.topics[3])
        : BigInt(receipt.blockNumber);
      return { agentId, txHash: hash };
    } catch (error: unknown) {
      const err = error as Error & { shortMessage?: string };
      throw new Error(`ERC-8004 registration failed: ${err.shortMessage || err.message}`);
    }
  }

  async hasAgentIdentity(address: Address): Promise<boolean> {
    try {
      const balance = await this.publicClient.readContract({
        address: this.identityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      return (balance as bigint) > 0n;
    } catch {
      return false;
    }
  }

  /** Score range: 0-100 */
  async getReputationScore(agentId: bigint): Promise<number> {
    try {
      const score = await this.publicClient.readContract({
        address: this.reputationRegistry,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getAverageScore',
        args: [agentId],
      });
      return Number(score as bigint);
    } catch {
      return 0;
    }
  }

  async getFeedbackCount(agentId: bigint): Promise<number> {
    try {
      const count = await this.publicClient.readContract({
        address: this.reputationRegistry,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getFeedbackCount',
        args: [agentId],
      });
      return Number(count as bigint);
    } catch {
      return 0;
    }
  }

  async getTotalAgents(): Promise<number> {
    try {
      const supply = await this.publicClient.readContract({
        address: this.identityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'totalSupply',
      });
      return Number(supply as bigint);
    } catch {
      return 0;
    }
  }
}
