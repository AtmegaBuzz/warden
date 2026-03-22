import { useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || ''

interface Stats {
  total: number
  approved: number
  blocked: number
  topBlockReasons: { rule: string; count: number }[]
}

interface AuditEntry {
  approved: boolean
  reason: string
  ruleTriggered: string | null
  riskScore?: number
  timestamp: number
  agentId: string
  transactionDetails: { to: string; value: string; token?: string; chain: string }
  txHash?: string
}

interface PolicyDecision {
  approved: boolean
  reason: string
  ruleTriggered: string | null
  riskScore?: number
  timestamp: number
  agentId: string
  transactionDetails: { to: string; value: string; token?: string; chain: string }
  onChain?: boolean
  onChainApproved?: boolean | null
  txHash?: string | null
  etherscanUrl?: string | null
  blockNumber?: number
  gasUsed?: string
  chainError?: string
}

interface WalletInfo {
  address: string
  ethBalance: string
  usdtBalance: string
}

interface ContractInfo {
  deployed: boolean
  address: string
  network: string
  version?: string | null
  etherscan?: string
}

export interface AgentInfo {
  id: string
  walletAddress: string | null
  frozen: boolean
  sessionKeyRevoked: boolean
  balance: { eth: string; usdt: string } | null
  onChainState: { valid: boolean; remainingBudget: string; remainingBudgetUsdt: string } | null
  spending: { spent: string; remaining: string; txCount: number }
  policy: Record<string, unknown>
}

interface ApiMode {
  mode: 'live' | 'simulated'
  rpcUrl: string
  policyDelegate: string | null
  network: string
}

export function useWarden(selectedAgent: string | null) {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [agentIds, setAgentIds] = useState<string[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null)
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null)
  const [apiMode, setApiMode] = useState<ApiMode | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [agentsRes, statsRes, logRes] = await Promise.all([
        fetch(`${API}/api/agents`),
        fetch(`${API}/api/stats${selectedAgent ? `?agentId=${selectedAgent}` : ''}`),
        fetch(`${API}/api/audit?limit=100${selectedAgent ? `&agentId=${selectedAgent}` : ''}`),
      ])

      if (!agentsRes.ok || !statsRes.ok || !logRes.ok) {
        throw new Error('API request failed')
      }

      const agentsData = await agentsRes.json() as AgentInfo[]
      setAgents(agentsData)
      setAgentIds(agentsData.map(a => a.id))
      setStats(await statsRes.json() as Stats)
      setAuditLog(await logRes.json() as AuditEntry[])
      setError(null)
      setLastUpdate(new Date())
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [selectedAgent])

  const fetchContractInfo = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/contract-info`)
      if (res.ok) setContractInfo(await res.json() as ContractInfo)
    } catch {}
  }, [])

  const fetchMode = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/mode`)
      if (res.ok) setApiMode(await res.json() as ApiMode)
    } catch {}
  }, [])

  const fetchWalletInfo = useCallback(async (address: string) => {
    try {
      const res = await fetch(`${API}/api/wallet-info?address=${encodeURIComponent(address)}`)
      if (res.ok) setWalletInfo(await res.json() as WalletInfo)
    } catch {}
  }, [])

  useEffect(() => {
    void fetchData()
    void fetchContractInfo()
    void fetchMode()
    const interval = setInterval(() => void fetchData(), 3000)
    return () => clearInterval(interval)
  }, [fetchData, fetchContractInfo, fetchMode])

  const freezeAgent = async (agentId: string) => {
    const res = await fetch(`${API}/api/freeze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    })
    if (res.ok) await fetchData()
    return res.ok
  }

  const unfreezeAgent = async (agentId: string) => {
    const res = await fetch(`${API}/api/unfreeze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    })
    if (res.ok) await fetchData()
    return res.ok
  }

  const revokeSessionKey = async (agentId: string) => {
    const res = await fetch(`${API}/api/revoke-session-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    })
    if (res.ok) await fetchData()
    return res.ok
  }

  const updatePolicy = async (agentId: string, policy: Record<string, number>) => {
    const res = await fetch(`${API}/api/policy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, ...policy }),
    })
    if (res.ok) await fetchData()
    return res.ok
  }

  const simulateTransaction = async (agentId: string, amount: number, recipient: string): Promise<PolicyDecision> => {
    const res = await fetch(`${API}/api/execute-transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, amount, recipient }),
    })
    const decision = await res.json() as PolicyDecision
    await fetchData()
    return decision
  }

  return {
    agents, agentIds, stats, auditLog, loading, error, lastUpdate,
    walletInfo, contractInfo, apiMode,
    freezeAgent, unfreezeAgent, revokeSessionKey, updatePolicy, simulateTransaction,
    fetchWalletInfo, fetchContractInfo,
    refresh: fetchData,
    isLive: apiMode?.mode === 'live',
  }
}
