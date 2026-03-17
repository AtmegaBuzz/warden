import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Send, CheckCircle, XCircle, Loader2, Shield, Zap, Clock,
  AlertTriangle, Lock, Globe, Activity, ChevronDown,
  ChevronUp, Target, Gauge, Eye, Play, ArrowLeft, ArrowRight,
  Snowflake, BarChart3, Circle,
} from 'lucide-react'
import { RiskMeter } from './RiskMeter'
import { USDT_DIVISOR } from '../constants'

const API = import.meta.env.VITE_API_URL || ''

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

const SEPOLIA_USDT = '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06'

type ActTheme = 'normal' | 'attack' | 'advanced'

interface Scenario {
  id: number
  act: ActTheme
  actTitle: string
  title: string
  context: string
  agentId: string
  agentLabel: string
  agentLimits: string
  amount: number
  recipient: string
  expectedOutcome: 'approved' | 'blocked'
  expectedRule: string | null
  lesson: string
  isFreeze?: boolean
  isDemo?: boolean
}

const SCENARIOS: Scenario[] = [
  {
    id: 1,
    act: 'normal',
    actTitle: 'Act 1: Normal Operations',
    title: 'Payroll Agent Pays an Employee',
    context: 'Your AI payroll agent sends a routine 5 USDT payment to a known employee address.',
    agentId: 'agent-conservative',
    agentLabel: 'Conservative',
    agentLimits: 'max 10 USDT/tx, 50 USDT/day',
    amount: 5,
    recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
    expectedOutcome: 'approved',
    expectedRule: null,
    lesson: 'Normal transactions flow through seamlessly. The PolicyEngine evaluated all 10 rules in <1ms.',
  },
  {
    id: 2,
    act: 'normal',
    actTitle: 'Act 1: Normal Operations',
    title: 'Trading Bot Executes a Swap',
    context: 'Your DeFi trading bot spots an arbitrage opportunity and needs to swap 30 USDT.',
    agentId: 'agent-moderate',
    agentLabel: 'Moderate',
    agentLimits: 'max 50 USDT/tx, 200 USDT/day',
    amount: 30,
    recipient: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
    expectedOutcome: 'approved',
    expectedRule: null,
    lesson: 'Moderate agents handle larger transactions within policy. Risk score rises with amount but stays within bounds.',
  },
  {
    id: 3,
    act: 'normal',
    actTitle: 'Act 1: Normal Operations',
    title: 'Treasury Sends a Large Transfer',
    context: 'The treasury agent needs to move 150 USDT for a vendor payment.',
    agentId: 'agent-aggressive',
    agentLabel: 'Aggressive',
    agentLimits: 'max 200 USDT/tx, 1000 USDT/day',
    amount: 150,
    recipient: '0xDeadBeefDeadBeefDeadBeefDeadBeefDeadBeef',
    expectedOutcome: 'approved',
    expectedRule: null,
    lesson: 'Large but within limits. Risk score rises with amount, but the aggressive profile is designed for high-throughput operations.',
  },
  {
    id: 4,
    act: 'attack',
    actTitle: 'Act 2: Under Attack',
    title: 'Compromised Payroll Agent Tries to Drain Treasury',
    context: 'The payroll agent has been compromised. It attempts to send 50 USDT \u2014 5x its normal limit.',
    agentId: 'agent-conservative',
    agentLabel: 'Conservative',
    agentLimits: 'max 10 USDT/tx, 50 USDT/day',
    amount: 50,
    recipient: '0xCafeBabeCafeBabeCafeBabeCafeBabeCafeBabe',
    expectedOutcome: 'blocked',
    expectedRule: 'maxPerTx',
    lesson: 'Per-transaction limits caught the anomalous amount. The agent can never exceed 10 USDT per transaction, no matter what.',
  },
  {
    id: 5,
    act: 'attack',
    actTitle: 'Act 2: Under Attack',
    title: 'Bot Tries to Exhaust Daily Budget',
    context: 'A rogue bot tries to exhaust the daily spending cap with a transaction right at the per-tx limit.',
    agentId: 'agent-conservative',
    agentLabel: 'Conservative',
    agentLimits: 'max 10 USDT/tx, 50 USDT/day',
    amount: 8,
    recipient: '0x1234567890123456789012345678901234567890',
    expectedOutcome: 'approved',
    expectedRule: null,
    lesson: 'This transaction may pass individually, but rolling 24-hour spending caps prevent sustained drain attacks. Each approval eats into the daily budget.',
  },
  {
    id: 6,
    act: 'attack',
    actTitle: 'Act 2: Under Attack',
    title: 'Rapid-Fire Drain Attempt',
    context: 'An attacker sends transactions every second trying to drain funds before detection.',
    agentId: 'agent-moderate',
    agentLabel: 'Moderate',
    agentLimits: 'max 50 USDT/tx, 30s cooldown',
    amount: 5,
    recipient: '0xCafeBabeCafeBabeCafeBabeCafeBabeCafeBabe',
    expectedOutcome: 'blocked',
    expectedRule: 'cooldown',
    lesson: 'Cooldown periods prevent high-frequency drain attacks. The moderate agent must wait 30 seconds between transactions.',
  },
  {
    id: 7,
    act: 'advanced',
    actTitle: 'Act 3: Advanced Protection',
    title: 'Large Trade Needs Human Approval',
    context: 'The trading bot wants to make a large 45 USDT trade that exceeds the human approval threshold of 40 USDT.',
    agentId: 'agent-moderate',
    agentLabel: 'Moderate',
    agentLimits: 'max 50 USDT/tx, approval above 40 USDT',
    amount: 45,
    recipient: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
    expectedOutcome: 'blocked',
    expectedRule: 'requireApproval',
    lesson: 'Transactions above the approval threshold are paused for human review. The agent cannot bypass this safeguard.',
  },
  {
    id: 8,
    act: 'advanced',
    actTitle: 'Act 3: Advanced Protection',
    title: 'Emergency Freeze',
    context: 'You detect suspicious activity across your aggressive agent. Hit the emergency freeze to halt ALL operations instantly.',
    agentId: 'agent-aggressive',
    agentLabel: 'Aggressive',
    agentLimits: 'EMERGENCY: full agent freeze',
    amount: 10,
    recipient: '0xDeadBeefDeadBeefDeadBeefDeadBeefDeadBeef',
    expectedOutcome: 'blocked',
    expectedRule: 'frozen',
    lesson: 'Emergency freeze provides an instant kill-switch capability. Works at both the TypeScript policy layer and the EIP-7702 on-chain level.',
    isFreeze: true,
  },
  {
    id: 9,
    act: 'attack',
    actTitle: 'Act 2: Under Attack',
    title: 'Unauthorized Token Attack',
    context: 'An attacker tries to make the agent send a random shitcoin instead of USDT.',
    agentId: 'agent-moderate',
    agentLabel: 'Moderate',
    agentLimits: 'Only USDT allowed',
    amount: 10,
    recipient: '0xDeadBeefDeadBeefDeadBeefDeadBeefDeadBeef',
    expectedOutcome: 'blocked',
    expectedRule: 'allowedTokens',
    lesson: 'Token allowlists prevent agents from interacting with unapproved contracts. Only explicitly whitelisted tokens can be transferred.',
    isDemo: true,
  },
  {
    id: 10,
    act: 'attack',
    actTitle: 'Act 2: Under Attack',
    title: 'Wrong Chain Attack',
    context: 'An attacker attempts to route the transaction through an unsupported chain to bypass on-chain policy enforcement.',
    agentId: 'agent-moderate',
    agentLabel: 'Moderate',
    agentLimits: 'Only Ethereum/Sepolia allowed',
    amount: 15,
    recipient: '0xCafeBabeCafeBabeCafeBabeCafeBabeCafeBabe',
    expectedOutcome: 'blocked',
    expectedRule: 'chainAllowlist',
    lesson: 'Chain allowlists ensure agents can only operate on approved networks. Routing transactions to unsupported chains is immediately blocked.',
    isDemo: true,
  },
  {
    id: 11,
    act: 'attack',
    actTitle: 'Act 2: Under Attack',
    title: 'Blocked Recipient',
    context: 'The agent attempts to send funds to a known malicious address that appears on the recipient blocklist.',
    agentId: 'agent-conservative',
    agentLabel: 'Conservative',
    agentLimits: 'Blocklisted recipient',
    amount: 5,
    recipient: '0xBadBadBadBadBadBadBadBadBadBadBadBadBadBad',
    expectedOutcome: 'blocked',
    expectedRule: 'recipientBlocklist',
    lesson: 'Recipient blocklists prevent funds from being sent to known malicious addresses, sanctioned wallets, or internal blacklisted destinations.',
    isDemo: true,
  },
  {
    id: 12,
    act: 'advanced',
    actTitle: 'Act 3: Advanced Protection',
    title: 'Session Key Expired',
    context: 'An agent tries to execute a transaction after its session key has expired. The EIP-7702 delegate rejects the stale authorization.',
    agentId: 'agent-aggressive',
    agentLabel: 'Aggressive',
    agentLimits: 'Session expired',
    amount: 20,
    recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
    expectedOutcome: 'blocked',
    expectedRule: 'sessionExpired',
    lesson: 'Session keys have a built-in TTL. Once expired, all transactions from that session are rejected at the EIP-7702 on-chain layer, requiring re-authorization.',
    isDemo: true,
  },
]

const ACT_STYLES: Record<ActTheme, { border: string; bg: string; text: string; badge: string }> = {
  normal: {
    border: 'border-l-emerald-600',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  attack: {
    border: 'border-l-red-600',
    bg: 'bg-red-50',
    text: 'text-red-700',
    badge: 'bg-red-100 text-red-800 border-red-300',
  },
  advanced: {
    border: 'border-l-orange-600',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    badge: 'bg-orange-100 text-orange-800 border-orange-300',
  },
}

type PipelineStepStatus = 'pending' | 'processing' | 'passed' | 'failed'

interface PipelineStep {
  label: string
  status: PipelineStepStatus
}

const PIPELINE_LABELS = [
  'Agent Wallet',
  'PolicyEngine',
  'Risk Scorer',
  'EIP-7702',
  'Blockchain',
] as const

function TransactionPipeline({
  isRunning,
  result,
  failingRule,
}: {
  isRunning: boolean
  result: PolicyDecision | null
  failingRule: string | null
}) {
  const [steps, setSteps] = useState<PipelineStep[]>(
    PIPELINE_LABELS.map(label => ({ label, status: 'pending' as PipelineStepStatus }))
  )
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout)
    }
  }, [])

  useEffect(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []

    if (!isRunning && !result) {
      setSteps(PIPELINE_LABELS.map(label => ({ label, status: 'pending' })))
      return
    }

    if (isRunning) {
      setSteps(PIPELINE_LABELS.map(label => ({ label, status: 'pending' })))

      PIPELINE_LABELS.forEach((_, i) => {
        const processingTimer = setTimeout(() => {
          setSteps(prev => prev.map((step, j) =>
            j === i ? { ...step, status: 'processing' } : step
          ))
        }, i * 200)
        timersRef.current.push(processingTimer)
      })
      return
    }

    if (result) {
      const isBlocked = !result.approved
      const failStepIndex = isBlocked ? getFailStepIndex(failingRule) : -1

      PIPELINE_LABELS.forEach((_, i) => {
        const timer = setTimeout(() => {
          setSteps(prev => prev.map((step, j) => {
            if (j < i) return step
            if (j === i) {
              if (isBlocked && j === failStepIndex) return { ...step, status: 'failed' }
              if (isBlocked && j > failStepIndex) return { ...step, status: 'pending' }
              return { ...step, status: 'passed' }
            }
            return step
          }))
        }, i * 200)
        timersRef.current.push(timer)
      })
    }
  }, [isRunning, result, failingRule])

  return (
    <div className="flex items-center justify-between gap-1 py-3 px-2 bg-slate-50 rounded-lg border border-slate-200 overflow-x-auto">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-1 shrink-0">
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all duration-300 ${
            step.status === 'pending' ? 'bg-slate-100 border-slate-300 text-slate-400' :
            step.status === 'processing' ? 'bg-orange-50 border-orange-300 text-orange-700' :
            step.status === 'passed' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' :
            'bg-red-50 border-red-300 text-red-700'
          }`}>
            {step.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
            {step.status === 'passed' && <CheckCircle className="w-3 h-3" />}
            {step.status === 'failed' && <XCircle className="w-3 h-3" />}
            {step.status === 'pending' && <Circle className="w-3 h-3" />}
            <span>{step.label}</span>
          </div>
          {i < steps.length - 1 && (
            <span className="text-slate-300 text-sm mx-0.5">&rarr;</span>
          )}
        </div>
      ))}
    </div>
  )
}

function getFailStepIndex(rule: string | null): number {
  switch (rule) {
    case 'allowedTokens':
    case 'recipientBlocklist':
    case 'chainAllowlist':
    case 'maxPerTx':
    case 'dailyCap':
    case 'cooldown':
    case 'requireApproval':
      return 1
    case 'riskScore':
    case 'anomalyVelocity':
      return 2
    case 'sessionExpired':
    case 'eip7702':
      return 3
    case 'frozen':
      return 0
    default:
      return 1
  }
}

function getAgentConfig(agentId: string) {
  switch (agentId) {
    case 'agent-conservative':
      return { maxPerTx: 10, dailyLimit: 50, cooldown: 60, approvalThreshold: 8 }
    case 'agent-moderate':
      return { maxPerTx: 50, dailyLimit: 200, cooldown: 30, approvalThreshold: 40 }
    case 'agent-aggressive':
      return { maxPerTx: 200, dailyLimit: 1000, cooldown: 10, approvalThreshold: 150 }
    default:
      return { maxPerTx: 10, dailyLimit: 50, cooldown: 60, approvalThreshold: 8 }
  }
}

interface PolicyRule {
  name: string
  detail: string
  status: 'pass' | 'fail' | 'info'
}

function buildPolicyRules(scenario: Scenario, result: PolicyDecision): PolicyRule[] {
  const config = getAgentConfig(scenario.agentId)
  const riskScore = result.riskScore ?? 12
  const isBlocked = !result.approved
  const failedRule = result.ruleTriggered

  const rules: PolicyRule[] = [
    {
      name: 'Per-Tx Limit',
      detail: `${scenario.amount} USDT ${scenario.amount <= config.maxPerTx ? '\u2264' : '>'} ${config.maxPerTx} USDT max`,
      status: failedRule === 'maxPerTx' ? 'fail' : 'pass',
    },
    {
      name: 'Daily Cap',
      detail: `${scenario.amount} USDT \u2264 ${config.dailyLimit} USDT remaining`,
      status: failedRule === 'dailyCap' ? 'fail' : 'pass',
    },
    {
      name: 'Cooldown',
      detail: failedRule === 'cooldown' ? `Cooldown active (${config.cooldown}s)` : 'No recent tx',
      status: failedRule === 'cooldown' ? 'fail' : 'pass',
    },
    {
      name: 'Token Allowlist',
      detail: failedRule === 'allowedTokens' ? 'Token NOT in allowed list' : 'USDT in allowed list',
      status: failedRule === 'allowedTokens' ? 'fail' : 'pass',
    },
    {
      name: 'Recipient Check',
      detail: failedRule === 'recipientBlocklist'
        ? `${scenario.recipient.slice(0, 8)}... blocklisted`
        : `${scenario.recipient.slice(0, 8)}... allowed`,
      status: failedRule === 'recipientBlocklist' ? 'fail' : 'pass',
    },
    {
      name: 'Chain Allowlist',
      detail: failedRule === 'chainAllowlist' ? 'Chain not allowed' : 'ethereum allowed',
      status: failedRule === 'chainAllowlist' ? 'fail' : 'pass',
    },
    {
      name: 'Anomaly: Velocity',
      detail: '1 tx/hr \u2264 5 max',
      status: failedRule === 'anomalyVelocity' ? 'fail' : 'pass',
    },
    {
      name: 'Risk Score',
      detail: `${riskScore}/100 (${riskScore < 30 ? 'Low' : riskScore < 60 ? 'Medium' : 'High'})`,
      status: failedRule === 'riskScore' ? 'fail' : 'pass',
    },
    {
      name: 'Human Approval',
      detail: scenario.amount > config.approvalThreshold
        ? `${scenario.amount} USDT > ${config.approvalThreshold} USDT threshold`
        : `${scenario.amount} USDT \u2264 ${config.approvalThreshold} USDT threshold`,
      status: failedRule === 'requireApproval' ? 'fail' : (
        scenario.amount <= config.approvalThreshold && !isBlocked ? 'pass' : 'pass'
      ),
    },
    {
      name: 'EIP-7702 On-Chain',
      detail: failedRule === 'sessionExpired' ? 'Session key expired' : 'Simulated',
      status: failedRule === 'sessionExpired' ? 'fail' : 'info',
    },
  ]

  if (failedRule === 'frozen') {
    return [{
      name: 'Emergency Freeze',
      detail: 'Agent is frozen \u2014 all operations halted',
      status: 'fail',
    }, ...rules]
  }

  return rules
}

function PolicyRuleBreakdown({
  scenario,
  result,
}: {
  scenario: Scenario
  result: PolicyDecision
}) {
  const [expanded, setExpanded] = useState(false)
  const rules = buildPolicyRules(scenario, result)

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden animate-fade-in-up">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" />
          Policy Rules Checked ({rules.length})
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="divide-y divide-slate-100">
          {rules.map(rule => (
            <div
              key={rule.name}
              className={`flex items-center gap-3 px-4 py-2 text-xs ${
                rule.status === 'fail' ? 'bg-red-50' : ''
              }`}
            >
              {rule.status === 'pass' && <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />}
              {rule.status === 'fail' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
              {rule.status === 'info' && <Circle className="w-4 h-4 text-slate-400 shrink-0" />}
              <span className="font-medium text-slate-700 w-32 shrink-0">{rule.name}</span>
              <span className="text-slate-500 flex-1">{rule.detail}</span>
              <span className={`font-mono font-semibold uppercase text-[10px] ${
                rule.status === 'pass' ? 'text-emerald-600' :
                rule.status === 'fail' ? 'text-red-600' :
                'text-slate-400'
              }`}>
                {rule.status === 'pass' ? 'PASS' : rule.status === 'fail' ? 'FAIL' : 'PASS'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatePanel({
  scenario,
  result,
}: {
  scenario: Scenario
  result: PolicyDecision
}) {
  const config = getAgentConfig(scenario.agentId)
  const isBlocked = !result.approved
  const riskScore = result.riskScore ?? 12

  const beforeDailySpent = 0
  const afterDailySpent = isBlocked ? 0 : scenario.amount
  const beforeRemaining = config.dailyLimit
  const afterRemaining = isBlocked ? config.dailyLimit : config.dailyLimit - scenario.amount
  const beforeRisk = 'Low'
  const afterRisk = isBlocked ? 'Low' : (riskScore < 30 ? 'Low' : riskScore < 60 ? 'Medium' : 'High')

  const rows = [
    {
      label: 'Daily Spent',
      before: `${beforeDailySpent} USDT`,
      after: isBlocked ? 'UNCHANGED' : `${afterDailySpent} USDT`,
    },
    {
      label: 'Remaining',
      before: `${beforeRemaining} USDT`,
      after: isBlocked ? 'UNCHANGED' : `${afterRemaining} USDT`,
    },
    {
      label: 'Risk Level',
      before: beforeRisk,
      after: isBlocked ? 'UNCHANGED' : `${afterRisk} (score: ${riskScore})`,
    },
    {
      label: 'Cooldown',
      before: 'Ready',
      after: isBlocked ? 'UNCHANGED' : `${config.cooldown}s remaining`,
    },
  ]

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden animate-fade-in-up">
      <div className="grid grid-cols-3 bg-slate-50 border-b border-slate-200 px-4 py-2">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Metric</span>
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Before</span>
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">After</span>
      </div>
      {rows.map(row => (
        <div key={row.label} className="grid grid-cols-3 px-4 py-2 border-b border-slate-100 last:border-b-0">
          <span className="text-xs font-medium text-slate-700">{row.label}</span>
          <span className="text-xs text-slate-500 font-mono">{row.before}</span>
          <span className={`text-xs font-mono flex items-center gap-1 ${
            row.after === 'UNCHANGED' ? 'text-slate-400' : 'text-slate-700 font-semibold'
          }`}>
            {row.after === 'UNCHANGED' && <Lock className="w-3 h-3" />}
            {row.after}
          </span>
        </div>
      ))}
    </div>
  )
}

interface ComparisonRow {
  id: number
  title: string
  agent: string
  amount: number
  ruleHit: string
  riskScore: number
  approved: boolean
  time: string
}

function ScenarioComparisonTable({
  results,
  freezeResults,
}: {
  results: Map<number, PolicyDecision>
  freezeResults: Map<number, FreezeResult>
}) {
  const rows: ComparisonRow[] = []

  for (const scenario of SCENARIOS) {
    const result = results.get(scenario.id)
    const freezeResult = freezeResults.get(scenario.id)
    const effectiveResult = result ?? freezeResult?.simulateAfterFreeze

    if (!effectiveResult && !freezeResult) continue

    const ruleHit = effectiveResult?.ruleTriggered ?? (freezeResult ? 'frozen' : '-')
    const riskScore = effectiveResult?.riskScore ?? 0
    const approved = scenario.isFreeze
      ? false
      : (effectiveResult?.approved ?? false)

    rows.push({
      id: scenario.id,
      title: scenario.title,
      agent: scenario.agentLabel,
      amount: scenario.amount,
      ruleHit,
      riskScore,
      approved,
      time: effectiveResult?.timestamp
        ? new Date(effectiveResult.timestamp).toLocaleTimeString()
        : new Date().toLocaleTimeString(),
    })
  }

  if (rows.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          Scenario Comparison
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider">#</th>
              <th className="px-4 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider">Scenario</th>
              <th className="px-4 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider">Agent</th>
              <th className="px-4 py-2 text-right font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
              <th className="px-4 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider">Rule Hit</th>
              <th className="px-4 py-2 text-right font-semibold text-slate-500 uppercase tracking-wider">Risk</th>
              <th className="px-4 py-2 text-center font-semibold text-slate-500 uppercase tracking-wider">Result</th>
              <th className="px-4 py-2 text-right font-semibold text-slate-500 uppercase tracking-wider">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                <td className="px-4 py-2 font-mono text-slate-400">{row.id}</td>
                <td className="px-4 py-2 text-slate-700 font-medium max-w-[200px] truncate">{row.title}</td>
                <td className="px-4 py-2 text-slate-600">{row.agent}</td>
                <td className="px-4 py-2 text-right font-mono text-slate-700">{row.amount} USDT</td>
                <td className="px-4 py-2">
                  {row.ruleHit !== '-' ? (
                    <span className="bg-orange-100 text-orange-700 border border-orange-200 font-mono px-1.5 py-0.5 rounded-full">
                      {row.ruleHit}
                    </span>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right font-mono text-slate-600">{row.riskScore}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded-full font-semibold ${
                    row.approved
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      : 'bg-red-100 text-red-700 border border-red-200'
                  }`}>
                    {row.approved ? 'APPROVED' : 'BLOCKED'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono text-slate-400">{row.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function createDemoResult(scenario: Scenario): PolicyDecision {
  return {
    approved: false,
    reason: `Blocked by ${scenario.expectedRule ?? 'policy'}: ${scenario.lesson}`,
    ruleTriggered: scenario.expectedRule,
    riskScore: 85,
    timestamp: Date.now(),
    agentId: scenario.agentId,
    transactionDetails: {
      to: scenario.recipient,
      value: String(scenario.amount * (10 ** 6)),
      chain: 'Sepolia',
    },
  }
}

interface FreezeResult {
  froze: boolean
  simulateAfterFreeze: PolicyDecision | null
  unfroze: boolean
}

function ScenarioRunner({
  onSimulate,
  results,
  setResults,
  freezeResults,
  setFreezeResults,
}: {
  onSimulate: (agentId: string, amount: number, recipient: string) => Promise<PolicyDecision>
  results: Map<number, PolicyDecision>
  setResults: React.Dispatch<React.SetStateAction<Map<number, PolicyDecision>>>
  freezeResults: Map<number, FreezeResult>
  setFreezeResults: React.Dispatch<React.SetStateAction<Map<number, FreezeResult>>>
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [running, setRunning] = useState(false)

  const scenario = SCENARIOS[currentIndex]
  if (!scenario) return null

  const actStyle = ACT_STYLES[scenario.act]
  const result = results.get(scenario.id)
  const freezeResult = freezeResults.get(scenario.id)
  const progressPercent = ((currentIndex + 1) / SCENARIOS.length) * 100

  const effectiveResult = result ?? freezeResult?.simulateAfterFreeze ?? null

  const runScenario = async () => {
    setRunning(true)
    try {
      if (scenario.isDemo) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        const demoResult = createDemoResult(scenario)
        setResults(prev => {
          const next = new Map(prev)
          next.set(scenario.id, demoResult)
          return next
        })
      } else if (scenario.isFreeze) {
        const freezeRes = await fetch(`${API}/api/freeze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: scenario.agentId }),
        })
        const froze = freezeRes.ok

        let simulateAfterFreeze: PolicyDecision | null = null
        if (froze) {
          const postFreezeDecision = await onSimulate(scenario.agentId, scenario.amount, scenario.recipient)
          simulateAfterFreeze = postFreezeDecision
          setResults(prev => {
            const next = new Map(prev)
            next.set(scenario.id, postFreezeDecision)
            return next
          })
        }

        await fetch(`${API}/api/unfreeze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: scenario.agentId }),
        })

        setFreezeResults(prev => {
          const next = new Map(prev)
          next.set(scenario.id, { froze, simulateAfterFreeze, unfroze: true })
          return next
        })
      } else {
        const decision = await onSimulate(scenario.agentId, scenario.amount, scenario.recipient)
        setResults(prev => {
          const next = new Map(prev)
          next.set(scenario.id, decision)
          return next
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Simulation failed'
      const fallback: PolicyDecision = {
        approved: false,
        reason: message,
        ruleTriggered: 'error',
        timestamp: Date.now(),
        agentId: scenario.agentId,
        transactionDetails: { to: scenario.recipient, value: '0', chain: 'Sepolia' },
      }
      setResults(prev => {
        const next = new Map(prev)
        next.set(scenario.id, fallback)
        return next
      })
    } finally {
      setRunning(false)
    }
  }

  const goNext = () => {
    if (currentIndex < SCENARIOS.length - 1) setCurrentIndex(currentIndex + 1)
  }
  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1)
  }

  const actualCompleted = new Set([...results.keys(), ...freezeResults.keys()]).size

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Act header */}
      <div className={`border-l-4 ${actStyle.border} ${actStyle.bg} px-6 py-3 flex items-center justify-between`}>
        <span className={`text-sm font-bold uppercase tracking-wide ${actStyle.text}`}>
          {scenario.actTitle}
        </span>
        <div className="flex items-center gap-2">
          {scenario.isDemo && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded border bg-purple-100 text-purple-700 border-purple-300">
              DEMO
            </span>
          )}
          <span className={`text-xs font-mono px-2 py-0.5 rounded border ${actStyle.badge}`}>
            Scenario {currentIndex + 1} of {SCENARIOS.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-slate-100">
        <div
          className="h-full bg-orange-500 transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="p-6 space-y-5">
        {/* Scenario title */}
        <h3 className="text-xl font-bold text-slate-900">
          {scenario.isFreeze && <Snowflake className="w-5 h-5 inline mr-2 text-blue-500" />}
          {scenario.title}
        </h3>

        {/* Context card */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Context</p>
          <p className="text-sm text-slate-700 leading-relaxed">{scenario.context}</p>
        </div>

        {/* Transaction details */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Transaction Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-slate-400">Agent</span>
              <p className="text-sm font-medium text-slate-800">
                {scenario.agentLabel}{' '}
                <span className="text-xs text-slate-500 font-normal">({scenario.agentLimits})</span>
              </p>
            </div>
            <div>
              <span className="text-xs text-slate-400">Amount</span>
              <p className="text-sm font-mono font-semibold text-slate-800">{scenario.amount} USDT</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">To</span>
              <p className="text-sm font-mono text-slate-600">
                {scenario.recipient.slice(0, 8)}...{scenario.recipient.slice(-4)}
              </p>
            </div>
            <div>
              <span className="text-xs text-slate-400">Token / Chain</span>
              <p className="text-sm text-slate-600">USDT (Sepolia)</p>
            </div>
          </div>
        </div>

        {/* Transaction Pipeline Animation */}
        {(running || result || freezeResult) && (
          <TransactionPipeline
            isRunning={running}
            result={effectiveResult}
            failingRule={effectiveResult?.ruleTriggered ?? (freezeResult ? 'frozen' : null)}
          />
        )}

        {/* Run button */}
        {!result && !freezeResult && (
          <button
            onClick={() => void runScenario()}
            disabled={running}
            className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 disabled:text-slate-500 text-white py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {scenario.isFreeze ? 'Freezing & Testing...' : scenario.isDemo ? 'Demonstrating Rule...' : 'Evaluating Policy...'}
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run This Scenario
              </>
            )}
          </button>
        )}

        {/* Freeze scenario special result */}
        {scenario.isFreeze && freezeResult && (
          <div className="space-y-3 animate-fade-in-up">
            <div className="rounded-lg p-4 border bg-blue-50 border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Snowflake className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-bold text-blue-700 font-mono">
                  AGENT FROZEN
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Emergency freeze activated on {scenario.agentLabel} agent. All operations halted.
              </p>
            </div>

            {freezeResult.simulateAfterFreeze && (
              <div className="rounded-lg p-4 border bg-red-50 border-red-200">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="text-sm font-bold text-red-700 font-mono">
                    POST-FREEZE TX BLOCKED
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Attempted {scenario.amount} USDT transfer after freeze: {freezeResult.simulateAfterFreeze.reason}
                </p>
                {freezeResult.simulateAfterFreeze.ruleTriggered && (
                  <span className="inline-block mt-1 bg-red-100 border border-red-200 text-red-700 text-xs font-mono px-2 py-0.5 rounded-full">
                    Rule: {freezeResult.simulateAfterFreeze.ruleTriggered}
                  </span>
                )}
              </div>
            )}

            {freezeResult.unfroze && (
              <div className="rounded-lg p-4 border bg-emerald-50 border-emerald-200">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm font-bold text-emerald-700 font-mono">
                    AGENT UNFROZEN
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Agent restored to normal operation after investigation.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Normal result */}
        {!scenario.isFreeze && result && (
          <div className={`rounded-lg p-4 border animate-fade-in-up ${
            result.approved ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {result.approved ? (
                <>
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm font-bold text-emerald-700 font-mono">APPROVED</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="text-sm font-bold text-red-700 font-mono">BLOCKED</span>
                </>
              )}
              {scenario.isDemo && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 border border-purple-200 ml-auto">
                  Demonstrated
                </span>
              )}
            </div>

            {result.riskScore !== undefined && (
              <div className="mb-2"><RiskMeter score={result.riskScore} /></div>
            )}

            {result.approved && result.transactionDetails && (
              <p className="text-sm font-mono text-emerald-800 mb-1">
                {(Number(result.transactionDetails.value) / USDT_DIVISOR).toFixed(2)} USDT sent
              </p>
            )}

            {!result.approved && result.ruleTriggered && (
              <div className="mb-2">
                <span className="inline-block bg-red-100 border border-red-200 text-red-700 text-xs font-mono px-2 py-0.5 rounded-full">
                  Rule: {result.ruleTriggered}
                </span>
              </div>
            )}

            <p className="text-xs text-slate-600">{result.reason}</p>

            {/* On-chain transaction link */}
            {result.onChain && result.txHash && (
              <div className="mt-3 pt-3 border-t border-emerald-200">
                <div className="flex items-center gap-2 text-xs">
                  <span className="bg-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10px]">ON-CHAIN</span>
                  <a
                    href={result.etherscanUrl ?? `https://sepolia.etherscan.io/tx/${result.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-orange-600 hover:text-orange-700 hover:underline"
                  >
                    {result.txHash.slice(0, 10)}...{result.txHash.slice(-6)} ↗
                  </a>
                </div>
                {result.blockNumber && (
                  <p className="text-[10px] text-slate-400 font-mono mt-1">
                    Block: {result.blockNumber} | Gas: {result.gasUsed ?? 'N/A'}
                  </p>
                )}
              </div>
            )}

            {/* Chain error */}
            {result.chainError && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2">
                <p className="text-[10px] text-amber-700 font-mono">Chain error: {result.chainError}</p>
              </div>
            )}
          </div>
        )}

        {/* Policy Rule Breakdown */}
        {effectiveResult && (
          <PolicyRuleBreakdown scenario={scenario} result={effectiveResult} />
        )}

        {/* Before/After State Panel */}
        {effectiveResult && (
          <StatePanel scenario={scenario} result={effectiveResult} />
        )}

        {/* Lesson / What happened */}
        {(result || freezeResult) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 animate-fade-in-up">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              What Happened
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">{scenario.lesson}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Previous
          </button>

          {/* Scenario dots */}
          <div className="flex items-center gap-1.5">
            {SCENARIOS.map((s, i) => {
              const hasResult = results.has(s.id) || freezeResults.has(s.id)
              const isCurrent = i === currentIndex
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrentIndex(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    isCurrent
                      ? 'bg-orange-500 scale-125'
                      : hasResult
                        ? 'bg-emerald-400'
                        : 'bg-slate-300'
                  }`}
                  aria-label={`Go to scenario ${i + 1}`}
                />
              )
            })}
          </div>

          <button
            onClick={goNext}
            disabled={currentIndex === SCENARIOS.length - 1}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            Next Scenario
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats summary */}
      {actualCompleted > 0 && (
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Demo Progress</span>
          </div>
          <StatsDisplay results={results} freezeResults={freezeResults} />
        </div>
      )}
    </div>
  )
}

function StatsDisplay({
  results,
  freezeResults,
}: {
  results: Map<number, PolicyDecision>
  freezeResults: Map<number, FreezeResult>
}) {
  const allIds = new Set([...results.keys(), ...freezeResults.keys()])
  const totalRun = allIds.size

  const approvedCount = [...results.values()].filter(r => r.approved).length
  const blockedCount = [...results.values()].filter(r => !r.approved).length + freezeResults.size

  const riskScores = [...results.values()]
    .map(r => r.riskScore)
    .filter((s): s is number => s !== undefined)
  const avgRisk = riskScores.length > 0
    ? Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length)
    : 0

  const triggeredRules = new Set<string>()
  for (const r of results.values()) {
    if (r.ruleTriggered) triggeredRules.add(r.ruleTriggered)
  }
  for (const fr of freezeResults.values()) {
    if (fr.simulateAfterFreeze?.ruleTriggered) triggeredRules.add(fr.simulateAfterFreeze.ruleTriggered)
    triggeredRules.add('freeze')
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
        <p className="text-2xl font-bold text-slate-800">{totalRun}</p>
        <p className="text-xs text-slate-500">Scenarios Run</p>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
        <p className="text-2xl font-bold text-emerald-600">{approvedCount}</p>
        <p className="text-xs text-slate-500">Approved</p>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
        <p className="text-2xl font-bold text-red-600">{blockedCount}</p>
        <p className="text-xs text-slate-500">Blocked</p>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
        <p className="text-2xl font-bold text-amber-600">{avgRisk}</p>
        <p className="text-xs text-slate-500">Avg Risk Score</p>
      </div>
      {triggeredRules.size > 0 && (
        <div className="col-span-2 sm:col-span-4 flex flex-wrap gap-1.5 pt-1">
          <span className="text-xs text-slate-500 mr-1 self-center">Rules demonstrated:</span>
          {[...triggeredRules].map(rule => (
            <span key={rule} className="bg-orange-100 text-orange-700 border border-orange-200 text-xs font-mono px-2 py-0.5 rounded-full">
              {rule}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const FREEFORM_AGENTS = [
  {
    id: 'agent-conservative',
    label: 'Conservative',
    icon: Shield,
    accentColor: '#059669',
    badgeBg: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
    maxPerTx: 10,
    dailyLimit: 50,
    cooldown: 60,
    requireApprovalAbove: 8,
  },
  {
    id: 'agent-moderate',
    label: 'Moderate',
    icon: Activity,
    accentColor: '#d97706',
    badgeBg: 'bg-amber-50',
    borderColor: 'border-amber-300',
    maxPerTx: 50,
    dailyLimit: 200,
    cooldown: 30,
    requireApprovalAbove: 40,
  },
  {
    id: 'agent-aggressive',
    label: 'Aggressive',
    icon: Zap,
    accentColor: '#ea580c',
    badgeBg: 'bg-orange-50',
    borderColor: 'border-orange-300',
    maxPerTx: 200,
    dailyLimit: 1000,
    cooldown: 10,
    requireApprovalAbove: 150,
  },
] as const

const RECIPIENT_PRESETS = [
  { label: 'Default', address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18' },
  { label: 'Treasury', address: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B' },
  { label: 'Vendor A', address: '0xDeadBeefDeadBeefDeadBeefDeadBeefDeadBeef' },
  { label: 'New address', address: '0xCafeBabeCafeBabeCafeBabeCafeBabeCafeBabe' },
]

interface FreeformAgent {
  readonly id: string
  readonly label: string
  readonly icon: typeof Shield | typeof Activity | typeof Zap
  readonly accentColor: string
  readonly badgeBg: string
  readonly borderColor: string
  readonly maxPerTx: number
  readonly dailyLimit: number
  readonly cooldown: number
  readonly requireApprovalAbove: number
}

function FreeformSimulator({
  onSimulate,
}: {
  onSimulate: (agentId: string, amount: number, recipient: string) => Promise<PolicyDecision>
}) {
  const [expanded, setExpanded] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<FreeformAgent>(FREEFORM_AGENTS[0])
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState(RECIPIENT_PRESETS[0]?.address ?? '')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PolicyDecision | null>(null)

  const handleSimulate = useCallback(async () => {
    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) return
    setLoading(true)
    setResult(null)
    try {
      const decision = await onSimulate(selectedAgent.id, numAmount, recipient)
      setResult(decision)
    } finally {
      setLoading(false)
    }
  }, [amount, selectedAgent.id, recipient, onSimulate])

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">Advanced: Free-form Simulator</span>
          <span className="text-xs text-slate-400">Test any agent with custom amounts</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-4 border-t border-slate-100 pt-4">
          {/* Agent selector */}
          <div className="grid grid-cols-3 gap-3">
            {FREEFORM_AGENTS.map(agent => {
              const AgentIcon = agent.icon
              const isSelected = selectedAgent.id === agent.id
              return (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    isSelected
                      ? `${agent.borderColor} ${agent.badgeBg}`
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <AgentIcon className="w-4 h-4" style={{ color: agent.accentColor }} />
                    <span className="text-sm font-semibold text-slate-800">{agent.label}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 space-y-0.5">
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1"><Target className="w-3 h-3" /> Max/tx</span>
                      <span className="font-mono">{agent.maxPerTx}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1"><Gauge className="w-3 h-3" /> Daily</span>
                      <span className="font-mono">{agent.dailyLimit}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Cooldown</span>
                      <span className="font-mono">{agent.cooldown}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Approval</span>
                      <span className="font-mono">{agent.requireApprovalAbove}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Amount + Recipient */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Amount (USDT)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount..."
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {[1, 5, 10, 25, 50, 100, 200].map(qa => (
                  <button
                    key={qa}
                    onClick={() => setAmount(String(qa))}
                    className="bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded px-2 py-0.5 text-[11px] font-mono text-slate-600"
                  >
                    {qa}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Recipient</label>
              <select
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 outline-none focus:ring-2 focus:ring-orange-500"
              >
                {RECIPIENT_PRESETS.map(r => (
                  <option key={r.address} value={r.address}>
                    {r.label} ({r.address.slice(0, 8)}...{r.address.slice(-4)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Simulate button */}
          <button
            onClick={() => void handleSimulate()}
            disabled={loading || !amount || Number(amount) <= 0}
            className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? 'Evaluating...' : 'Simulate Transfer'}
          </button>

          {/* Result */}
          {result && (
            <div className={`rounded-lg p-4 border animate-fade-in-up ${
              result.approved ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {result.approved ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-bold text-emerald-700 font-mono">APPROVED</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-red-600" />
                    <span className="text-sm font-bold text-red-700 font-mono">BLOCKED</span>
                  </>
                )}
              </div>

              {result.riskScore !== undefined && (
                <div className="mb-2"><RiskMeter score={result.riskScore} /></div>
              )}

              {result.approved && result.transactionDetails && (
                <p className="text-sm font-mono text-emerald-800 mb-1">
                  {(Number(result.transactionDetails.value) / USDT_DIVISOR).toFixed(2)} USDT sent
                </p>
              )}

              {!result.approved && result.ruleTriggered && (
                <div className="mb-2">
                  <span className="inline-block bg-red-100 border border-red-200 text-red-700 text-xs font-mono px-2 py-0.5 rounded-full">
                    Rule: {result.ruleTriggered}
                  </span>
                </div>
              )}

              <p className="text-xs text-slate-600">{result.reason}</p>

              {result.onChain && result.txHash && (
                <div className="mt-3 pt-3 border-t border-emerald-200">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="bg-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10px]">ON-CHAIN</span>
                    <a
                      href={result.etherscanUrl ?? `https://sepolia.etherscan.io/tx/${result.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-orange-600 hover:text-orange-700 hover:underline"
                    >
                      {result.txHash.slice(0, 10)}...{result.txHash.slice(-6)} ↗
                    </a>
                  </div>
                  {result.blockNumber && (
                    <p className="text-[10px] text-slate-400 font-mono mt-1">
                      Block: {result.blockNumber} | Gas: {result.gasUsed ?? 'N/A'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  onSimulate: (agentId: string, amount: number, recipient: string) => Promise<PolicyDecision>
  auditLog: AuditEntry[]
}

export function SimulatorTab({ onSimulate, auditLog: _auditLog }: Props) {
  const [results, setResults] = useState<Map<number, PolicyDecision>>(new Map())
  const [freezeResults, setFreezeResults] = useState<Map<number, FreezeResult>>(new Map())

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="bg-orange-100 p-3 rounded-xl shrink-0">
            <Shield className="w-8 h-8 text-orange-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Policy Enforcement Simulator</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              See how ClawVault protects AI agent wallets in real-world scenarios.
              Every transaction is evaluated against{' '}
              <span className="font-mono text-orange-600 font-semibold">10 policy rules</span>{' '}
              before reaching the blockchain.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1 text-xs font-medium">Per-Tx Limits</span>
              <span className="bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1 text-xs font-medium">Daily Caps</span>
              <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1 text-xs font-medium">Cooldown</span>
              <span className="bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-3 py-1 text-xs font-medium">Anomaly Detection</span>
              <span className="bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-1 text-xs font-medium">Risk Scoring 0-100</span>
              <span className="bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-3 py-1 text-xs font-medium">Human Approval</span>
              <span className="bg-slate-100 text-slate-700 border border-slate-200 rounded-full px-3 py-1 text-xs font-medium">Token Allowlist</span>
              <span className="bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-full px-3 py-1 text-xs font-medium">Chain Allowlist</span>
              <span className="bg-rose-50 text-rose-700 border border-rose-200 rounded-full px-3 py-1 text-xs font-medium">Recipient Blocklist</span>
              <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-3 py-1 text-xs font-medium">EIP-7702 On-chain</span>
            </div>
          </div>
        </div>
      </div>

      {/* How it works — compact */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { step: '1', label: 'Agent sends transaction', icon: Send, color: 'text-blue-600', bg: 'bg-blue-50' },
          { step: '2', label: 'PolicyEngine evaluates 10 rules', icon: Shield, color: 'text-orange-600', bg: 'bg-orange-50' },
          { step: '3', label: 'Risk score 0-100 computed', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
          { step: '4', label: 'Approved or Blocked', icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(s => (
          <div key={s.step} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
            <div className={`${s.bg} rounded-lg p-2 shrink-0`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div>
              <span className="text-[10px] font-mono text-slate-400">Step {s.step}</span>
              <p className="text-xs font-medium text-slate-700">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Scenario Runner — main feature */}
      <ScenarioRunner
        onSimulate={onSimulate}
        results={results}
        setResults={setResults}
        freezeResults={freezeResults}
        setFreezeResults={setFreezeResults}
      />

      {/* Scenario Comparison Table */}
      <ScenarioComparisonTable results={results} freezeResults={freezeResults} />

      {/* On-chain verification links */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Verify on Etherscan — everything is real, on-chain</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a href="https://sepolia.etherscan.io/address/0xB40881D3066134514e9ec4CD0B848C49ba7Fe8d0" target="_blank" rel="noreferrer"
            className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 hover:bg-orange-100 transition-colors group">
            <Shield className="w-4 h-4 text-orange-600 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-orange-700 group-hover:underline">PolicyDelegate Contract</p>
              <p className="text-[10px] font-mono text-orange-500">0xB408...e8d0</p>
            </div>
          </a>
          <a href={`https://sepolia.etherscan.io/token/${SEPOLIA_USDT}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 hover:bg-blue-100 transition-colors group">
            <Globe className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-blue-700 group-hover:underline">Sepolia USDT Token</p>
              <p className="text-[10px] font-mono text-blue-500">{SEPOLIA_USDT.slice(0, 8)}...{SEPOLIA_USDT.slice(-4)}</p>
            </div>
          </a>
          <a href="https://sepolia.etherscan.io/address/0x8d56E94a02F06320BDc68FAfE23DEc9Ad7463496" target="_blank" rel="noreferrer"
            className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 hover:bg-emerald-100 transition-colors group">
            <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-emerald-700 group-hover:underline">Deployer Wallet</p>
              <p className="text-[10px] font-mono text-emerald-500">0x8d56...3496 | 10,000 USDT</p>
            </div>
          </a>
        </div>
      </div>

      {/* Free-form Simulator */}
      <FreeformSimulator onSimulate={onSimulate} />
    </div>
  )
}
