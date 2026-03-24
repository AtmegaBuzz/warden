import { AuditEntry, PolicyDecision } from './types.js';

export class AuditLogger {
  private entries: AuditEntry[] = [];
  private maxEntries: number;
  private onLog?: (entry: AuditEntry) => void | Promise<void>;

  constructor(options?: { maxEntries?: number; onLog?: (entry: AuditEntry) => void | Promise<void> }) {
    this.maxEntries = options?.maxEntries || 10000;
    this.onLog = options?.onLog;
  }

  async log(decision: PolicyDecision, txResult?: { hash: string; blockNumber: number; gasUsed: bigint }): Promise<void> {
    const entry: AuditEntry = {
      ...decision,
      txHash: txResult?.hash,
      blockNumber: txResult?.blockNumber,
      gasUsed: txResult?.gasUsed,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    if (this.onLog) await this.onLog(entry);

    const status = entry.approved ? 'APPROVED' : 'BLOCKED';
    console.log(
      `[AUDIT] ${status} | Agent: ${entry.agentId} | To: ${entry.transactionDetails.to} | ` +
      `Amount: ${entry.transactionDetails.value} | Risk: ${entry.riskScore ?? 'N/A'} | ` +
      `Rule: ${entry.ruleTriggered || 'none'} | Reason: ${entry.reason}`
    );
  }

  getEntries(filter?: {
    agentId?: string; approved?: boolean; since?: number; limit?: number;
  }): AuditEntry[] {
    let results = [...this.entries];
    if (filter?.agentId) results = results.filter(e => e.agentId === filter.agentId);
    if (filter?.approved !== undefined) results = results.filter(e => e.approved === filter.approved);
    if (filter?.since) results = results.filter(e => e.timestamp >= filter.since!);
    results.reverse();
    if (filter?.limit) results = results.slice(0, filter.limit);
    return results;
  }

  getStats(agentId?: string) {
    const entries = agentId ? this.entries.filter(e => e.agentId === agentId) : this.entries;
    const approved = entries.filter(e => e.approved).length;
    const blocked = entries.filter(e => !e.approved);
    const reasonCounts = new Map<string, number>();
    for (const entry of blocked) {
      const rule = entry.ruleTriggered || 'unknown';
      reasonCounts.set(rule, (reasonCounts.get(rule) || 0) + 1);
    }
    return {
      total: entries.length, approved, blocked: blocked.length,
      topBlockReasons: Array.from(reasonCounts.entries())
        .map(([rule, count]) => ({ rule, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  toJSON(): string {
    return JSON.stringify(this.entries, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
  }

  /** Export entries for persistence (bigints as strings) */
  exportEntries(): unknown[] {
    return JSON.parse(this.toJSON());
  }

  /** Import entries from persisted data */
  loadEntries(data: unknown[]): void {
    if (!Array.isArray(data)) return;
    for (const raw of data) {
      const entry = raw as Record<string, unknown>;
      const td = entry.transactionDetails as Record<string, unknown>;
      this.entries.push({
        approved: entry.approved as boolean,
        reason: entry.reason as string,
        ruleTriggered: (entry.ruleTriggered as string) || null,
        timestamp: entry.timestamp as number,
        agentId: entry.agentId as string,
        riskScore: entry.riskScore as number | undefined,
        riskFactors: entry.riskFactors as AuditEntry['riskFactors'],
        transactionDetails: {
          to: td.to as string,
          value: BigInt(td.value as string || '0'),
          token: td.token as string | undefined,
          chain: td.chain as string,
        },
        txHash: entry.txHash as string | undefined,
        blockNumber: entry.blockNumber as number | undefined,
        gasUsed: entry.gasUsed ? BigInt(entry.gasUsed as string) : undefined,
      });
    }
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }
}
