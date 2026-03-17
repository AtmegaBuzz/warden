# 04 — React Dashboard Implementation Guide (v2 — Improved)

## Overview

A React dashboard showing real-time agent activity, policy decisions, spending charts, risk scores, and **working** emergency controls. **v2 adds: wired API calls for freeze/unfreeze/revoke, risk score display, WebSocket-ready architecture, and a connection status indicator.**

---

## Step 1: Setup

```bash
mkdir -p packages/dashboard
cd packages/dashboard
npm create vite@latest . -- --template react-ts
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install recharts lucide-react
```

### vite.config.ts
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 3002, proxy: { '/api': 'http://localhost:3001' } }
})
```

### src/index.css
```css
@import "tailwindcss";
```

---

## Step 2: API Hook (NEW — Centralized Data Fetching)

```tsx
// src/hooks/useClawVault.ts
import { useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || ''

export function useClawVault(selectedAgent: string | null) {
  const [agents, setAgents] = useState<string[]>([])
  const [stats, setStats] = useState<any>(null)
  const [auditLog, setAuditLog] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

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

      setAgents(await agentsRes.json())
      setStats(await statsRes.json())
      setAuditLog(await logRes.json())
      setError(null)
      setLastUpdate(new Date())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selectedAgent])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 3000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Action APIs
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

  const updatePolicy = async (agentId: string, policy: any) => {
    const res = await fetch(`${API}/api/policy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, ...policy }),
    })
    if (res.ok) await fetchData()
    return res.ok
  }

  return {
    agents, stats, auditLog, loading, error, lastUpdate,
    freezeAgent, unfreezeAgent, revokeSessionKey, updatePolicy,
    refresh: fetchData,
  }
}
```

---

## Step 3: App Layout (src/App.tsx) — IMPROVED

```tsx
import { useState } from 'react'
import { AgentList } from './components/AgentList'
import { TransactionLog } from './components/TransactionLog'
import { SpendingChart } from './components/SpendingChart'
import { PolicyEditor } from './components/PolicyEditor'
import { StatsBar } from './components/StatsBar'
import { useClawVault } from './hooks/useClawVault'
import { Shield, AlertTriangle, Wifi, WifiOff } from 'lucide-react'

export default function App() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const {
    agents, stats, auditLog, loading, error, lastUpdate,
    freezeAgent, unfreezeAgent, revokeSessionKey, updatePolicy,
  } = useClawVault(selectedAgent)

  const handleFreezeAll = async () => {
    if (!confirm('Are you sure you want to FREEZE ALL agents? This will halt all operations.')) return
    for (const agentId of agents) {
      await freezeAgent(agentId)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-orange-500" />
            <div>
              <h1 className="text-xl font-bold">ClawVault Dashboard</h1>
              <p className="text-sm text-gray-400">EIP-7702 Policy Enforcement for Agent Wallets</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Connection status */}
            <div className="flex items-center gap-1 text-xs">
              {error ? (
                <><WifiOff className="w-3 h-3 text-red-400" /><span className="text-red-400">Disconnected</span></>
              ) : (
                <><Wifi className="w-3 h-3 text-green-400" /><span className="text-green-400">Live</span></>
              )}
            </div>

            {stats && (
              <>
                <div className="text-sm">
                  <span className="text-green-400">{stats.approved}</span> approved
                </div>
                <div className="text-sm">
                  <span className="text-red-400">{stats.blocked}</span> blocked
                </div>
              </>
            )}

            <button
              onClick={handleFreezeAll}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              Emergency Freeze All
            </button>
          </div>
        </div>
      </header>

      {/* Stats Bar (NEW) */}
      {stats && <StatsBar stats={stats} auditLog={auditLog} />}

      {/* Main Grid */}
      <main className="p-6 grid grid-cols-12 gap-6">
        <div className="col-span-3">
          <AgentList
            agents={agents}
            selected={selectedAgent}
            onSelect={setSelectedAgent}
          />
        </div>

        <div className="col-span-6 space-y-6">
          <SpendingChart auditLog={auditLog} />
          <TransactionLog entries={auditLog} />
        </div>

        <div className="col-span-3">
          <PolicyEditor
            agentId={selectedAgent}
            onFreeze={freezeAgent}
            onUnfreeze={unfreezeAgent}
            onRevokeSessionKey={revokeSessionKey}
            onUpdatePolicy={updatePolicy}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-2 text-xs text-gray-600 text-center">
        Last updated: {lastUpdate.toLocaleTimeString()} | Polling every 3s
      </footer>
    </div>
  )
}
```

---

## Step 4: Stats Bar (NEW)

```tsx
// src/components/StatsBar.tsx
import { TrendingUp, TrendingDown, Activity, AlertTriangle } from 'lucide-react'

interface Props {
  stats: { total: number; approved: number; blocked: number; topBlockReasons: { rule: string; count: number }[] }
  auditLog: any[]
}

export function StatsBar({ stats, auditLog }: Props) {
  const approvalRate = stats.total > 0 ? ((stats.approved / stats.total) * 100).toFixed(1) : '0'
  const avgRisk = auditLog.length > 0
    ? (auditLog.reduce((sum, e) => sum + (e.riskScore || 0), 0) / auditLog.length).toFixed(0)
    : '0'

  const totalVolume = auditLog
    .filter(e => e.approved)
    .reduce((sum, e) => sum + Number(e.transactionDetails?.value || 0) / 1e6, 0)

  return (
    <div className="px-6 pt-4 grid grid-cols-4 gap-4">
      <div className="bg-gray-900 rounded-xl p-4 flex items-center gap-3">
        <Activity className="w-8 h-8 text-blue-400" />
        <div>
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-gray-400">Total Transactions</p>
        </div>
      </div>
      <div className="bg-gray-900 rounded-xl p-4 flex items-center gap-3">
        <TrendingUp className="w-8 h-8 text-green-400" />
        <div>
          <p className="text-2xl font-bold">{approvalRate}%</p>
          <p className="text-xs text-gray-400">Approval Rate</p>
        </div>
      </div>
      <div className="bg-gray-900 rounded-xl p-4 flex items-center gap-3">
        <AlertTriangle className="w-8 h-8 text-yellow-400" />
        <div>
          <p className="text-2xl font-bold">{avgRisk}</p>
          <p className="text-xs text-gray-400">Avg Risk Score</p>
        </div>
      </div>
      <div className="bg-gray-900 rounded-xl p-4 flex items-center gap-3">
        <TrendingDown className="w-8 h-8 text-orange-400" />
        <div>
          <p className="text-2xl font-bold">{totalVolume.toFixed(0)}</p>
          <p className="text-xs text-gray-400">Volume (USDT)</p>
        </div>
      </div>
    </div>
  )
}
```

---

## Step 5: Agent List Component (Same as v1)

```tsx
// src/components/AgentList.tsx
import { User } from 'lucide-react'

interface Props {
  agents: string[]
  selected: string | null
  onSelect: (id: string | null) => void
}

export function AgentList({ agents, selected, onSelect }: Props) {
  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Agents</h2>
      <button
        onClick={() => onSelect(null)}
        className={`w-full text-left px-3 py-2 rounded-lg mb-1 text-sm ${
          selected === null ? 'bg-orange-600/20 text-orange-400' : 'hover:bg-gray-800 text-gray-300'
        }`}
      >
        All Agents
      </button>
      {agents.map(id => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={`w-full text-left px-3 py-2 rounded-lg mb-1 text-sm flex items-center gap-2 ${
            selected === id ? 'bg-orange-600/20 text-orange-400' : 'hover:bg-gray-800 text-gray-300'
          }`}
        >
          <User className="w-4 h-4" />
          {id}
        </button>
      ))}
    </div>
  )
}
```

---

## Step 6: Transaction Log (IMPROVED — Shows Risk Scores)

```tsx
// src/components/TransactionLog.tsx
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

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

export function TransactionLog({ entries }: { entries: AuditEntry[] }) {
  const getRiskColor = (score?: number) => {
    if (!score || score < 30) return 'text-green-400'
    if (score < 60) return 'text-yellow-400'
    return 'text-red-400'
  }

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Transaction Log</h2>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {entries.map((entry, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg border ${
              entry.approved
                ? 'border-green-900/50 bg-green-950/30'
                : 'border-red-900/50 bg-red-950/30'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {entry.approved ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400" />
                )}
                <span className="text-sm font-medium">
                  {entry.approved ? 'Approved' : 'Blocked'}
                </span>
                <span className="text-xs text-gray-500">{entry.agentId}</span>
                {entry.riskScore !== undefined && (
                  <span className={`text-xs ${getRiskColor(entry.riskScore)} flex items-center gap-1`}>
                    {entry.riskScore > 60 && <AlertTriangle className="w-3 h-3" />}
                    Risk: {entry.riskScore}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="text-xs text-gray-400 mb-1">
              To: {entry.transactionDetails.to.slice(0, 10)}...
              {' | '}
              Amount: {(Number(entry.transactionDetails.value) / 1e6).toFixed(2)} USDT
            </div>
            <div className="text-xs text-gray-500">
              {entry.ruleTriggered && (
                <span className="bg-gray-800 px-2 py-0.5 rounded mr-2">
                  {entry.ruleTriggered}
                </span>
              )}
              {entry.reason}
            </div>
            {entry.txHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${entry.txHash}`}
                target="_blank"
                className="text-xs text-blue-400 hover:underline mt-1 block"
              >
                View on Etherscan
              </a>
            )}
          </div>
        ))}
        {entries.length === 0 && (
          <div className="text-center text-gray-600 py-8">No transactions yet</div>
        )}
      </div>
    </div>
  )
}
```

---

## Step 7: Spending Chart (Same as v1)

```tsx
// src/components/SpendingChart.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

export function SpendingChart({ auditLog }: { auditLog: any[] }) {
  const agentData = new Map<string, { approved: number; blocked: number }>()
  for (const entry of auditLog) {
    const agent = entry.agentId
    if (!agentData.has(agent)) agentData.set(agent, { approved: 0, blocked: 0 })
    const data = agentData.get(agent)!
    const amount = Number(entry.transactionDetails.value) / 1e6
    if (entry.approved) data.approved += amount
    else data.blocked += amount
  }

  const chartData = Array.from(agentData.entries()).map(([name, data]) => ({
    name: name.length > 15 ? name.slice(0, 15) + '...' : name,
    approved: Math.round(data.approved * 100) / 100,
    blocked: Math.round(data.blocked * 100) / 100,
  }))

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Spending by Agent (USDT)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="name" stroke="#6B7280" fontSize={12} />
          <YAxis stroke="#6B7280" fontSize={12} />
          <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }} />
          <Legend />
          <Bar dataKey="approved" fill="#22C55E" name="Approved" radius={[4, 4, 0, 0]} />
          <Bar dataKey="blocked" fill="#EF4444" name="Blocked" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

---

## Step 8: Policy Editor (IMPROVED — Working Buttons)

```tsx
// src/components/PolicyEditor.tsx
import { useState } from 'react'
import { Settings, Save, Snowflake, Trash2, Sun } from 'lucide-react'

interface Props {
  agentId: string | null
  onFreeze: (agentId: string) => Promise<boolean>
  onUnfreeze: (agentId: string) => Promise<boolean>
  onRevokeSessionKey: (agentId: string) => Promise<boolean>
  onUpdatePolicy: (agentId: string, policy: any) => Promise<boolean>
}

export function PolicyEditor({ agentId, onFreeze, onUnfreeze, onRevokeSessionKey, onUpdatePolicy }: Props) {
  const [maxPerTx, setMaxPerTx] = useState('100')
  const [dailyLimit, setDailyLimit] = useState('500')
  const [cooldown, setCooldown] = useState('30')
  const [approvalThreshold, setApprovalThreshold] = useState('200')
  const [frozen, setFrozen] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!agentId) {
    return (
      <div className="bg-gray-900 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Policy Editor</h2>
        <p className="text-gray-500 text-sm">Select an agent to edit its policy</p>
      </div>
    )
  }

  const handleSave = async () => {
    setSaving(true)
    await onUpdatePolicy(agentId, {
      maxPerTx: Number(maxPerTx),
      dailyLimit: Number(dailyLimit),
      cooldownSeconds: Number(cooldown),
      approvalThreshold: Number(approvalThreshold),
    })
    setSaving(false)
  }

  const handleFreeze = async () => {
    if (!confirm(`Freeze agent ${agentId}? All operations will be halted.`)) return
    const ok = await onFreeze(agentId)
    if (ok) setFrozen(true)
  }

  const handleUnfreeze = async () => {
    const ok = await onUnfreeze(agentId)
    if (ok) setFrozen(false)
  }

  const handleRevoke = async () => {
    if (!confirm(`Revoke session key for ${agentId}? This cannot be undone.`)) return
    await onRevokeSessionKey(agentId)
  }

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">
        Policy: {agentId}
      </h2>

      {frozen && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-2 mb-4 text-xs text-blue-300 text-center">
          FROZEN — All operations halted
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Max per Transaction (USDT)</label>
          <input type="number" value={maxPerTx} onChange={(e) => setMaxPerTx(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Daily Limit (USDT)</label>
          <input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Cooldown (seconds)</label>
          <input type="number" value={cooldown} onChange={(e) => setCooldown(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Human Approval Above (USDT)</label>
          <input type="number" value={approvalThreshold} onChange={(e) => setApprovalThreshold(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Policy'}
        </button>

        <hr className="border-gray-800" />
        <h3 className="text-xs text-gray-400 uppercase font-semibold">Emergency Controls</h3>

        {frozen ? (
          <button onClick={handleUnfreeze}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
            <Sun className="w-4 h-4" />
            Unfreeze Agent
          </button>
        ) : (
          <button onClick={handleFreeze}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
            <Snowflake className="w-4 h-4" />
            Freeze Agent
          </button>
        )}

        <button onClick={handleRevoke}
          className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
          <Trash2 className="w-4 h-4" />
          Revoke Session Key
        </button>
      </div>
    </div>
  )
}
```

---

## Running the Dashboard

```bash
# Terminal 1: API server
cd agents/demo && npx tsx api-server.ts

# Terminal 2: Dashboard
cd packages/dashboard && npm run dev
# Open http://localhost:3002

# Terminal 3: Run agent demo (generates data)
cd agents/demo && npx tsx multi-agent-demo.ts
```

---

## What Changed from v1 to v2

| Area | v1 | v2 |
|------|-----|-----|
| Emergency buttons | UI-only, no API calls | Working: calls POST /api/freeze, /api/unfreeze, /api/revoke-session-key |
| Save Policy | UI-only | Working: calls POST /api/policy |
| Risk scores | Not shown | Displayed in transaction log with color coding |
| Stats bar | None | New component: total txs, approval rate, avg risk, volume |
| Connection status | None | Live/Disconnected indicator in header |
| Data fetching | Inline in App.tsx | Extracted to useClawVault hook |
| Freeze state | Not tracked | Visual indicator when frozen |
| Confirmation dialogs | None | Added for destructive actions |
