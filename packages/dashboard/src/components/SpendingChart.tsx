import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { USDT_DIVISOR } from '../constants'

interface AuditEntry {
  agentId: string
  approved: boolean
  transactionDetails: { value: string }
}

export function SpendingChart({ auditLog }: { auditLog: AuditEntry[] }) {
  const agentData = new Map<string, { approved: number; blocked: number }>()
  for (const entry of auditLog) {
    const agent = entry.agentId
    if (!agentData.has(agent)) agentData.set(agent, { approved: 0, blocked: 0 })
    const data = agentData.get(agent)!
    const amount = Number(entry.transactionDetails.value) / USDT_DIVISOR
    if (entry.approved) data.approved += amount
    else data.blocked += amount
  }

  const chartData = Array.from(agentData.entries()).map(([name, data]) => ({
    name: name.replace('agent-', ''),
    approved: Math.round(data.approved * 100) / 100,
    blocked: Math.round(data.blocked * 100) / 100,
  }))

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-sm font-semibold text-slate-900 uppercase mb-4 tracking-wider">
        Spending by Agent (USDT)
      </h2>
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} fontFamily="JetBrains Mono, monospace" />
            <YAxis stroke="#94a3b8" fontSize={12} fontFamily="JetBrains Mono, monospace" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            />
            <Legend wrapperStyle={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }} />
            <Bar dataKey="approved" fill="#059669" name="Approved" radius={[4, 4, 0, 0]} />
            <Bar dataKey="blocked" fill="#dc2626" name="Blocked" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm">
          No chart data yet. Use the Live Testnet tab to generate transactions.
        </div>
      )}
    </div>
  )
}
