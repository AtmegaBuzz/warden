import type { SpendingTracker } from './types.js';

const ONE_DAY_MS = 86400_000;

export interface IndexerConfig {
  apiKey?: string;
  baseUrl?: string;
}

interface Transfer {
  hash: string;
  from: string;
  to: string;
  amount: string;
  timestamp: number;
  token: string;
}

/**
 * Service for fetching historical transaction data from WDK Indexer API.
 *
 * Seeds the SpendingTracker with real on-chain history so anomaly detection
 * persists across process restarts. Falls back to memory-only if no API key.
 */
export class IndexerService {
  private apiKey: string;
  private baseUrl: string;

  constructor(config?: IndexerConfig) {
    this.apiKey = config?.apiKey ?? '';
    this.baseUrl = config?.baseUrl ?? 'https://wdk-api.tether.io';
  }

  get isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Fetch recent transfer history for an address.
   */
  async getTransferHistory(
    blockchain: string,
    token: string,
    address: string,
    limit: number = 50,
  ): Promise<Transfer[]> {
    if (!this.isAvailable) return [];

    try {
      const url = `${this.baseUrl}/v1/${blockchain}/token/${token}/transfers?address=${address}&limit=${limit}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`[Indexer] API error: ${response.status}`);
        return [];
      }

      const data = await response.json() as { transfers?: Transfer[] };
      return data.transfers ?? [];
    } catch (error) {
      console.error('[Indexer] Failed to fetch transfers:', error);
      return [];
    }
  }

  /**
   * Fetch token balance for an address.
   */
  async getTokenBalance(
    blockchain: string,
    token: string,
    address: string,
  ): Promise<bigint> {
    if (!this.isAvailable) return 0n;

    try {
      const url = `${this.baseUrl}/v1/${blockchain}/token/${token}/balance/${address}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return 0n;

      const data = await response.json() as { balance?: string };
      return BigInt(data.balance ?? '0');
    } catch {
      return 0n;
    }
  }

  /**
   * Seed a SpendingTracker with historical on-chain data.
   *
   * Fetches the last 24h of outbound transfers and populates:
   * - tracker.spent (sum of outbound transfers in window)
   * - tracker.recentRecipients (unique recipients)
   * - tracker.txTimestamps (transaction times)
   * - tracker.recentAmounts (last N transaction amounts)
   * - tracker.recipientSpendMap (per-recipient spending)
   */
  async seedSpendingTracker(
    blockchain: string,
    token: string,
    address: string,
    tracker: SpendingTracker,
  ): Promise<void> {
    const transfers = await this.getTransferHistory(blockchain, token, address);
    if (transfers.length === 0) return;

    const now = Date.now();
    const dayAgo = now - ONE_DAY_MS;
    const addressLower = address.toLowerCase();

    let spent = 0n;
    const timestamps: number[] = [];
    const recipients: string[] = [];
    const amounts: bigint[] = [];
    const recipientSpend: Record<string, bigint> = {};

    for (const tx of transfers) {
      // Only count outbound transfers
      if (tx.from.toLowerCase() !== addressLower) continue;

      const amount = BigInt(tx.amount);
      const ts = tx.timestamp * 1000; // convert to ms
      const recipient = tx.to.toLowerCase();

      if (ts > dayAgo) {
        spent += amount;
      }

      timestamps.push(ts);
      recipients.push(recipient);
      amounts.push(amount);
      recipientSpend[recipient] = (recipientSpend[recipient] ?? 0n) + amount;
    }

    tracker.spent = spent;
    tracker.txTimestamps = timestamps.filter(t => t > dayAgo);
    tracker.recentRecipients = recipients.slice(-100);
    tracker.recentAmounts = amounts.slice(-20);
    tracker.txCount = timestamps.filter(t => t > dayAgo).length;
    tracker.recipientSpendMap = recipientSpend;

    console.log(`[Indexer] Seeded tracker: ${tracker.txCount} recent txs, ${spent} spent in last 24h`);
  }
}
