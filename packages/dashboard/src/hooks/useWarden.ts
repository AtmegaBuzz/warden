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
  policyDelegateAddress: string
  usdtContractAddress: string
  deployerAddress: string
  network: string
  version: string
}

export function useWarden(selectedAgent: string | null) {
  const [agents, setAgents] = useState<string[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null)
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null)

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

      setAgents(await agentsRes.json() as string[])
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
      if (res.ok) {
        setContractInfo(await res.json() as ContractInfo)
      }
    } catch {
      // contract-info endpoint may not be available
    }
  }, [])

  const fetchWalletInfo = useCallback(async (address: string) => {
    try {
      const res = await fetch(`${API}/api/wallet-info?address=${encodeURIComponent(address)}`)
      if (res.ok) {
        setWalletInfo(await res.json() as WalletInfo)
      }
    } catch {
      // wallet-info endpoint may not be available
    }
  }, [])

  useEffect(() => {
    void fetchData()
    void fetchContractInfo()
    const interval = setInterval(() => void fetchData(), 3000)
    return () => clearInterval(interval)
  }, [fetchData, fetchContractInfo])

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
    agents, stats, auditLog, loading, error, lastUpdate,
    walletInfo, contractInfo,
    freezeAgent, unfreezeAgent, revokeSessionKey, updatePolicy, simulateTransaction,
    fetchWalletInfo, fetchContractInfo,
    refresh: fetchData,
  }
}
