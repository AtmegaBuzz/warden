import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
  type Hex,
  parseAbi,
  encodeFunctionData,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia, mainnet, arbitrumSepolia } from 'viem/chains';

const SUPPORTED_CHAINS: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  421614: arbitrumSepolia,
};

const POLICY_DELEGATE_ABI = parseAbi([
  'function initializePolicy(address recovery, uint256 recoveryDelay) external',
  'function createSessionKey(address eoa, address key, uint256 maxPerTx, uint256 dailyLimit, uint48 validAfter, uint48 validUntil, uint256 cooldownSeconds) external',
  'function revokeSessionKey(address eoa, address key) external',
  'function validateTransaction(address eoa, address sessionKey, address to, uint256 value, address token) public returns (bool)',
  'function freeze(address eoa) external',
  'function unfreeze(address eoa) external',
  'function execute(address sessionKey, address to, uint256 value, bytes data, address token) external',
  'function executeBatch(address sessionKey, address[] targets, uint256[] values, bytes[] datas, address[] tokens) external',
  'function getSessionKey(address eoa, address key) external view returns (bool active, uint256 maxPerTx, uint256 dailyLimit, uint256 spent, uint256 windowStart, uint48 validAfter, uint48 validUntil, uint256 cooldownSeconds, uint256 lastTxTimestamp, uint256 txCount)',
  'function getPolicy(address eoa) external view returns (bool initialized, bool frozen, address owner, address recovery, uint256 recoveryDelay, uint256 recoveryInitiated, address pendingOwner)',
  'function getRemainingDailyBudget(address eoa, address key) external view returns (uint256)',
  'function isSessionKeyValid(address eoa, address key) external view returns (bool)',
  'function getSessionKeyList(address eoa) external view returns (address[])',
  'function getActiveSessionKeyCount(address eoa) external view returns (uint256)',
  'event TransactionValidated(address indexed eoa, address indexed sessionKey, address indexed to, uint256 value, bool approved, string reason)',
  'event PolicyFrozen(address indexed eoa, address indexed by)',
  'event Executed(address indexed eoa, address indexed to, uint256 value, bytes data, bool success)',
]);

export interface EIP7702Config {
  providerUrl: string;
  policyDelegateAddress: Address;
  privateKey: Hex;
  chainId?: number;
}

export class EIP7702Manager {
  private publicClient;
  private walletClient;
  private account: ReturnType<typeof privateKeyToAccount>;
  private policyDelegateAddress: Address;
  private chain: Chain;

  constructor(config: EIP7702Config) {
    this.account = privateKeyToAccount(config.privateKey);
    this.policyDelegateAddress = config.policyDelegateAddress;

    const chainId = config.chainId ?? 11155111;
    const chain = SUPPORTED_CHAINS[chainId];
    if (!chain) throw new Error(`Unsupported chain ID: ${chainId}. Supported: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`);
    this.chain = chain;

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.providerUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(config.providerUrl),
    });
  }

  get address(): Address {
    return this.account.address;
  }

  /**
   * EIP-7702 delegation via viem type 0x04 transaction.
   * Sets the EOA's code to point to the PolicyDelegate contract,
   * giving it smart contract capabilities while keeping its address.
   */
  async delegateToPolicy(): Promise<Hex> {
    console.log(`[EIP-7702] Delegating ${this.account.address} -> ${this.policyDelegateAddress}`);

    const authorization = await this.walletClient.signAuthorization({
      account: this.account,
      contractAddress: this.policyDelegateAddress,
    });

    console.log('[EIP-7702] Authorization signed');

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: this.chain,
      authorizationList: [authorization],
      to: this.account.address,
      data: '0x' as Hex,
    });

    console.log(`[EIP-7702] Delegation tx: ${hash}`);

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[EIP-7702] Confirmed in block ${receipt.blockNumber}`);

    return hash;
  }

  async initializePolicy(recoveryAddress: Address, recoveryDelaySeconds: number = 3600): Promise<Hex> {
    const data = encodeFunctionData({
      abi: POLICY_DELEGATE_ABI,
      functionName: 'initializePolicy',
      args: [recoveryAddress, BigInt(recoveryDelaySeconds)],
    });

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: this.chain,
      to: this.account.address,
      data,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Policy] Initialized. Block: ${receipt.blockNumber}`);
    return hash;
  }

  async createSessionKey(params: {
    agentAddress: Address;
    maxPerTx: bigint;
    dailyLimit: bigint;
    validForSeconds: number;
    cooldownSeconds: number;
  }): Promise<Hex> {
    const now = Math.floor(Date.now() / 1000);

    const data = encodeFunctionData({
      abi: POLICY_DELEGATE_ABI,
      functionName: 'createSessionKey',
      args: [
        this.account.address,
        params.agentAddress,
        params.maxPerTx,
        params.dailyLimit,
        now,
        now + params.validForSeconds,
        BigInt(params.cooldownSeconds),
      ],
    });

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: this.chain,
      to: this.account.address,
      data,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Session] Key created for ${params.agentAddress}`);
    return hash;
  }

  async revokeSessionKey(agentAddress: Address): Promise<Hex> {
    const data = encodeFunctionData({
      abi: POLICY_DELEGATE_ABI,
      functionName: 'revokeSessionKey',
      args: [this.account.address, agentAddress],
    });

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: this.chain,
      to: this.account.address,
      data,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Session] Key revoked for ${agentAddress}`);
    return hash;
  }

  async validateOnChain(
    sessionKey: Address,
    to: Address,
    value: bigint,
    token: Address = '0x0000000000000000000000000000000000000000'
  ): Promise<boolean> {
    try {
      const result = await this.publicClient.simulateContract({
        address: this.account.address,
        abi: POLICY_DELEGATE_ABI,
        functionName: 'validateTransaction',
        args: [this.account.address, sessionKey, to, value, token],
        account: this.account,
      });
      return result.result as boolean;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Validation] On-chain check failed:', message);
      return false;
    }
  }

  async executeViaPolicy(params: {
    sessionKey: Address;
    to: Address;
    value: bigint;
    data: Hex;
    token: Address;
  }): Promise<Hex> {
    const calldata = encodeFunctionData({
      abi: POLICY_DELEGATE_ABI,
      functionName: 'execute',
      args: [params.sessionKey, params.to, params.value, params.data, params.token],
    });

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: this.chain,
      to: this.account.address,
      data: calldata,
      value: params.value,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Execute] Via policy. Block: ${receipt.blockNumber}`);
    return hash;
  }

  async freeze(): Promise<Hex> {
    const data = encodeFunctionData({
      abi: POLICY_DELEGATE_ABI,
      functionName: 'freeze',
      args: [this.account.address],
    });

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: this.chain,
      to: this.account.address,
      data,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    console.log('[Emergency] Policy FROZEN');
    return hash;
  }

  async unfreeze(): Promise<Hex> {
    const data = encodeFunctionData({
      abi: POLICY_DELEGATE_ABI,
      functionName: 'unfreeze',
      args: [this.account.address],
    });

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: this.chain,
      to: this.account.address,
      data,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    console.log('[Emergency] Policy UNFROZEN');
    return hash;
  }

  /**
   * Revoke EIP-7702 delegation by signing authorization to address(0),
   * which removes the delegation and returns the EOA to normal.
   */
  async revokeDelegation(): Promise<Hex> {
    console.log('[EIP-7702] Revoking delegation...');

    const authorization = await this.walletClient.signAuthorization({
      account: this.account,
      contractAddress: '0x0000000000000000000000000000000000000000',
    });

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: this.chain,
      authorizationList: [authorization],
      to: this.account.address,
      data: '0x' as Hex,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    console.log('[EIP-7702] Delegation revoked. EOA restored to plain account.');
    return hash;
  }

  async getTransactionReceipt(hash: Hex) {
    return this.publicClient.getTransactionReceipt({ hash });
  }

  async getRemainingBudget(sessionKey: Address): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.account.address,
      abi: POLICY_DELEGATE_ABI,
      functionName: 'getRemainingDailyBudget',
      args: [this.account.address, sessionKey],
    });
  }

  async isSessionKeyValid(sessionKey: Address): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.account.address,
      abi: POLICY_DELEGATE_ABI,
      functionName: 'isSessionKeyValid',
      args: [this.account.address, sessionKey],
    });
  }

  async getSessionKeyList(): Promise<Address[]> {
    return await this.publicClient.readContract({
      address: this.account.address,
      abi: POLICY_DELEGATE_ABI,
      functionName: 'getSessionKeyList',
      args: [this.account.address],
    }) as Address[];
  }

  async getActiveSessionKeyCount(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.account.address,
      abi: POLICY_DELEGATE_ABI,
      functionName: 'getActiveSessionKeyCount',
      args: [this.account.address],
    }) as bigint;
  }

  async getPolicy() {
    return await this.publicClient.readContract({
      address: this.account.address,
      abi: POLICY_DELEGATE_ABI,
      functionName: 'getPolicy',
      args: [this.account.address],
    });
  }

  watchTransactions(callback: (log: unknown) => void) {
    return this.publicClient.watchContractEvent({
      address: this.account.address,
      abi: POLICY_DELEGATE_ABI,
      eventName: 'TransactionValidated',
      onLogs: (logs) => logs.forEach(callback),
    });
  }

  watchFreezeEvents(callback: (log: unknown) => void) {
    return this.publicClient.watchContractEvent({
      address: this.account.address,
      abi: POLICY_DELEGATE_ABI,
      eventName: 'PolicyFrozen',
      onLogs: (logs) => logs.forEach(callback),
    });
  }
}
