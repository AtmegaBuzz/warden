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
}
