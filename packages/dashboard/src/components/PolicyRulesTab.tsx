import {
  DollarSign, Calendar, Clock, Ban, CheckSquare,
  UserCheck, Globe, Activity, ShieldAlert,
} from 'lucide-react'

interface PolicyRule {
  num: number
  name: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  example: string
  subRules?: string[]
}

const RULES: PolicyRule[] = [
  {
    num: 1,
    name: 'Per-Transaction Limit',
    icon: DollarSign,
    description: 'Caps the maximum amount in a single transaction. Each agent profile has a different ceiling.',
    example: 'Conservative agent blocked 15 USDT transfer (limit: 10 USDT)',
  },
  {
    num: 2,
    name: 'Daily Spending Limit',
    icon: Calendar,
    description: 'Rolling 24-hour spending cap. Resets automatically. Prevents cumulative drain attacks.',
    example: 'After spending 45 USDT of 50 USDT daily limit, a 10 USDT transfer is blocked',
  },
  {
    num: 3,
    name: 'Cooldown Period',
    icon: Clock,
    description: 'Minimum time between transactions. Prevents rapid-fire spending by compromised agents.',
    example: 'Second transaction within 60 seconds is blocked',
  },
  {
    num: 4,
    name: 'Blocked Tokens',
    icon: Ban,
    description: 'Explicitly blacklisted token contracts. Prevents interaction with known malicious tokens.',
    example: 'Transfer of SCAM token at 0xdead...beef is blocked regardless of amount',
  },
  {
    num: 5,
    name: 'Allowed Tokens',
    icon: CheckSquare,
    description: 'Whitelist of permitted token contracts. Only these tokens can be transferred.',
    example: 'Only USDT (0x1234...abcd) is in the allowlist; DAI transfer is blocked',
  },
  {
    num: 6,
    name: 'Blocked Recipients',
    icon: Ban,
    description: 'Known malicious or unauthorized addresses. Prevents funds from reaching bad actors.',
    example: 'Transfer to known phishing address 0xbad...1234 is blocked',
  },
  {
    num: 7,
    name: 'Allowed Recipients',
    icon: UserCheck,
    description: 'Whitelist of approved recipient addresses. When set, only these addresses can receive funds.',
    example: 'Transfer to 0xunknown...addr is blocked because it is not on the allowlist',
  },
  {
    num: 8,
    name: 'Chain Allowlist',
    icon: Globe,
    description: 'Restrict which blockchain networks the agent can use. Prevents cross-chain attacks.',
    example: 'Agent tries to send on Mainnet but only Sepolia (chain 11155111) is allowed',
  },
  {
    num: 9,
    name: 'Anomaly Detection',
    icon: Activity,
    description: 'Velocity checks, recipient diversity analysis, and large transaction flagging. Detects abnormal patterns.',
    example: 'Agent sends 15 transactions in 1 hour, exceeding velocity limit of 10/hr',
    subRules: [
      'Max transactions per hour (velocity check)',
      'Max unique recipients per hour (diversity check)',
      'Large transaction threshold (% of daily limit)',
    ],
  },
  {
    num: 10,
    name: 'Human Approval Threshold',
    icon: ShieldAlert,
    description: 'Transactions above this amount require explicit human approval before execution.',
    example: 'Moderate agent requests 150 USDT transfer; flagged for human review (threshold: 100 USDT)',
  },
]

function RuleIcon({ Icon }: { Icon: React.ComponentType<{ className?: string }> }) {
  return <Icon className="w-4 h-4 text-orange-600" />
}

export function PolicyRulesTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">
          10 Policy Rules — How ClawVault Protects Agent Wallets
        </h2>
        <p className="text-sm text-slate-500">
          Every transaction passes through all 10 rules. A single rule violation blocks the transaction.
        </p>
      </div>

      <div className="space-y-4">
        {RULES.map(rule => (
          <div key={rule.num} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-start gap-4">
              <span className="bg-orange-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold font-mono flex-shrink-0">
                {rule.num}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <RuleIcon Icon={rule.icon} />
                  <h3 className="text-base font-semibold text-slate-900">{rule.name}</h3>
                </div>
                <p className="text-sm text-slate-600 mb-3">{rule.description}</p>

                {rule.subRules && (
                  <ul className="mb-3 space-y-1">
                    {rule.subRules.map((sub, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                        {sub}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1 font-medium">Example</p>
                  <p className="text-sm font-mono text-slate-700">{rule.example}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
