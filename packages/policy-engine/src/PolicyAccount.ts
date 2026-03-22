import { PolicyEngine } from './PolicyEngine.js';
import { AuditLogger } from './AuditLogger.js';
import { EIP7702Manager } from './EIP7702Manager.js';
import type { AgentPolicy, PolicyDecision, PolicyWalletConfig, SpendingTracker, IWrappableAccount, EvmTransaction, TransferOptions, TransactionResult } from './types.js';

export class PolicyError extends Error {
  public decision: PolicyDecision;
  constructor(decision: PolicyDecision) {
    super(`Policy violation: ${decision.reason}`);
    this.name = 'PolicyError';
    this.decision = decision;
  }
}

export class PolicyAccount {
  private innerAccount: IWrappableAccount;
  private engine: PolicyEngine;
  private logger: AuditLogger;
  private eip7702?: EIP7702Manager;
  private config: PolicyWalletConfig;
  private chain: string;

  constructor(
    innerAccount: IWrappableAccount,
    config: PolicyWalletConfig,
    chain: string,
    eip7702?: EIP7702Manager
  ) {
    this.innerAccount = innerAccount;
    this.config = config;
    this.chain = chain;
    this.eip7702 = eip7702;
    this.engine = new PolicyEngine(config.policy);
    this.logger = new AuditLogger({ onLog: config.onAuditLog });
  }

  async getAddress(): Promise<string> { return this.innerAccount.getAddress(); }
  async getBalance(): Promise<bigint> { return this.innerAccount.getBalance(); }
  async getTokenBalance(tokenAddress: string): Promise<bigint> { return this.innerAccount.getTokenBalance(tokenAddress); }

  async sendTransaction(params: EvmTransaction): Promise<TransactionResult> {
    const value = BigInt(params.value);
    const decision = this.engine.evaluate(params.to, value, undefined, this.chain);

    if (!decision.approved) {
      if (decision.ruleTriggered === 'requireApproval' && this.config.onApprovalRequired) {
        const humanApproved = await this.config.onApprovalRequired(decision);
        if (humanApproved) {
          decision.approved = true;
          decision.reason = 'Approved by human operator';
        }
      }
      if (!decision.approved) {
        await this.logger.log(decision);
        throw new PolicyError(decision);
      }
    }

    if (this.eip7702 && this.config.policy.sessionKey) {
      const onChainApproved = await this.eip7702.validateOnChain(
        this.config.policy.sessionKey.address as `0x${string}`,
        params.to as `0x${string}`,
        value
      );
      if (!onChainApproved) {
        const blocked: PolicyDecision = {
          ...decision, approved: false,
          reason: 'Blocked by on-chain PolicyDelegate (EIP-7702)',
          ruleTriggered: 'onChainPolicy',
        };
        await this.logger.log(blocked);
        throw new PolicyError(blocked);
      }
    }

    try {
      const result = await this.innerAccount.sendTransaction(params);
      this.engine.recordTransaction(value, params.to);
      let blockNumber = 0;
      if (this.eip7702) {
        try {
          const receipt = await this.eip7702.getTransactionReceipt(result.hash as `0x${string}`);
          blockNumber = Number(receipt.blockNumber);
        } catch {
          // If receipt unavailable, log 0 rather than crashing
        }
      }
      await this.logger.log(decision, { hash: result.hash, blockNumber, gasUsed: result.fee });
      return result;
    } catch (error: unknown) {
      if (error instanceof PolicyError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      await this.logger.log({ ...decision, approved: false, reason: `Transaction failed: ${message}`, ruleTriggered: 'executionError' });
      throw error;
    }
  }

  async transfer(params: TransferOptions): Promise<TransactionResult> {
    const amount = BigInt(params.amount);
    const decision = this.engine.evaluate(params.recipient, amount, params.token, this.chain);

    if (!decision.approved) {
      if (decision.ruleTriggered === 'requireApproval' && this.config.onApprovalRequired) {
        const humanApproved = await this.config.onApprovalRequired(decision);
        if (humanApproved) {
          decision.approved = true;
          decision.reason = 'Approved by human operator';
        }
      }
      if (!decision.approved) {
        await this.logger.log(decision);
        throw new PolicyError(decision);
      }
    }

    if (this.eip7702 && this.config.policy.sessionKey) {
      const onChainApproved = await this.eip7702.validateOnChain(
        this.config.policy.sessionKey.address as `0x${string}`,
        params.recipient as `0x${string}`,
        amount,
        params.token as `0x${string}`
      );
      if (!onChainApproved) {
        const blocked: PolicyDecision = {
          ...decision, approved: false,
          reason: 'Blocked by on-chain PolicyDelegate (EIP-7702)',
          ruleTriggered: 'onChainPolicy',
        };
        await this.logger.log(blocked);
        throw new PolicyError(blocked);
      }
    }

    try {
      const result = await this.innerAccount.transfer(params);
      this.engine.recordTransaction(amount, params.recipient);
      let blockNumber = 0;
      if (this.eip7702) {
        try {
          const receipt = await this.eip7702.getTransactionReceipt(result.hash as `0x${string}`);
          blockNumber = Number(receipt.blockNumber);
        } catch {
          // If receipt unavailable, log 0 rather than crashing
        }
      }
      await this.logger.log(decision, { hash: result.hash, blockNumber, gasUsed: result.fee });
      return result;
    } catch (error: unknown) {
      if (error instanceof PolicyError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      await this.logger.log({ ...decision, approved: false, reason: `Transfer failed: ${message}`, ruleTriggered: 'executionError' });
      throw error;
    }
  }

  async quoteSendTransaction(params: Pick<EvmTransaction, 'to' | 'value'>): Promise<{ fee: bigint }> {
    return this.innerAccount.quoteSendTransaction(params);
  }

  async quoteTransfer(params: TransferOptions): Promise<{ fee: bigint }> {
    return this.innerAccount.quoteTransfer(params);
  }

  async sign(message: string): Promise<string> { return this.innerAccount.sign(message); }

  getSpendingStatus() { return this.engine.getSpendingStatus(); }
  getAuditLog(filter?: { approved?: boolean; limit?: number }) { return this.logger.getEntries(filter); }
  getAuditStats() { return this.logger.getStats(this.config.policy.agentId); }
  updatePolicy(updates: Partial<AgentPolicy>) { this.engine.updatePolicy(updates); }
  dispose(): void { this.innerAccount.dispose(); }
}
