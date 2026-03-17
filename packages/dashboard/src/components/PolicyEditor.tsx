import { useState } from 'react'
import { Save, Snowflake, Trash2, Sun } from 'lucide-react'

interface Props {
  agentId: string | null
  onFreeze: (agentId: string) => Promise<boolean>
  onUnfreeze: (agentId: string) => Promise<boolean>
  onRevokeSessionKey: (agentId: string) => Promise<boolean>
  onUpdatePolicy: (agentId: string, policy: Record<string, number>) => Promise<boolean>
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-slate-900 uppercase mb-3 tracking-wider">
          Policy Editor
        </h2>
        <p className="text-slate-400 text-sm">Select an agent to edit its policy</p>
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

  const inputClass = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500'

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-sm font-semibold text-slate-900 uppercase mb-1 tracking-wider">
        Policy Editor
      </h2>
      <p className="text-xs text-orange-600 font-mono mb-4">{agentId}</p>

      {frozen && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mb-4 text-xs text-blue-700 text-center font-mono font-medium">
          FROZEN — All operations halted
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="text-xs text-slate-500 block mb-1.5">Max per Transaction (USDT)</label>
          <input type="number" value={maxPerTx} onChange={(e) => setMaxPerTx(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1.5">Daily Limit (USDT)</label>
          <input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1.5">Cooldown (seconds)</label>
          <input type="number" value={cooldown} onChange={(e) => setCooldown(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1.5">Human Approval Above (USDT)</label>
          <input type="number" value={approvalThreshold} onChange={(e) => setApprovalThreshold(e.target.value)} className={inputClass} />
        </div>

        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Policy'}
        </button>

        <hr className="border-slate-200" />
        <h3 className="text-xs text-slate-400 uppercase font-semibold tracking-wider">Emergency Controls</h3>

        {frozen ? (
          <button onClick={() => void handleUnfreeze()}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
            <Sun className="w-4 h-4" />
            Unfreeze Agent
          </button>
        ) : (
          <button onClick={() => void handleFreeze()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
            <Snowflake className="w-4 h-4" />
            Freeze Agent
          </button>
        )}

        <button onClick={() => void handleRevoke()}
          className="w-full bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
          <Trash2 className="w-4 h-4" />
          Revoke Session Key
        </button>
      </div>
    </div>
  )
}
