import { Send, Shield, AlertTriangle, CheckCircle, ExternalLink, Wallet } from 'lucide-react'
import { StatsBar } from './StatsBar'
import { TransactionLog } from './TransactionLog'
import { SpendingChart } from './SpendingChart'

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

interface Stats {
  total: number
  approved: number
  blocked: number
  topBlockReasons: { rule: string; count: number }[]
}

interface ContractInfo {
  policyDelegateAddress: string
  usdtContractAddress: string
  deployerAddress: string
  network: string
  version: string
}

interface WalletInfo {
  address: string
  ethBalance: string
  usdtBalance: string
}

interface Props {
  stats: Stats | null
  auditLog: AuditEntry[]
  contractInfo: ContractInfo | null
  walletInfo: WalletInfo | null
}

const EXPLORER = 'https://sepolia.etherscan.io'

const STEPS = [
  { num: 1, title: 'Agent requests transaction', icon: Send, desc: 'AI agent initiates a USDT transfer' },
  { num: 2, title: 'Policy Engine evaluates 10 rules', icon: Shield, desc: 'Spending limits, anomaly detection, allowlists' },
  { num: 3, title: 'Risk score 0-100 computed', icon: AlertTriangle, desc: 'Weighted risk assessment across all rules' },
  { num: 4, title: 'Approved or Blocked', icon: CheckCircle, desc: 'Transaction proceeds or is rejected with reason' },
] as const

export function OverviewTab({ stats, auditLog, contractInfo, walletInfo }: Props) {
  return (
    <div className="space-y-8">
      {/* Hero Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Warden</h2>
        <p className="text-slate-600 max-w-2xl leading-relaxed">
          The firewall for AI agent wallets. Every transaction is evaluated against spending limits,
          anomaly detection, and risk scoring before it reaches the blockchain.
        </p>
        <div className="flex flex-wrap gap-3 mt-5">
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1 text-sm font-medium font-mono">
            29 tests passing
          </span>
          <span className="bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-3 py-1 text-sm font-medium font-mono">
            10,000 USDT on Sepolia
          </span>
        </div>
        {contractInfo && (
          <div className="mt-4">
            <a
              href={`${EXPLORER}/address/${contractInfo.policyDelegateAddress}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 font-mono hover:underline"
            >
              {contractInfo.policyDelegateAddress}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* How It Works */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">How It Works</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map(step => (
            <div key={step.num} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold font-mono">
                  {step.num}
                </span>
                <step.icon className="w-5 h-5 text-slate-400" />
              </div>
              <h4 className="text-sm font-semibold text-slate-900 mb-1">{step.title}</h4>
              <p className="text-xs text-slate-500">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Wallet Status */}
      {(contractInfo ?? walletInfo) && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-5 h-5 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Wallet Status</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contractInfo && (
              <>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Deployer Address</p>
                  <a
                    href={`${EXPLORER}/address/${contractInfo.deployerAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-mono text-slate-800 hover:text-orange-600"
                  >
                    {contractInfo.deployerAddress}
                  </a>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">PolicyDelegate</p>
                  <a
                    href={`${EXPLORER}/address/${contractInfo.policyDelegateAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-mono text-slate-800 hover:text-orange-600"
                  >
                    {contractInfo.policyDelegateAddress}
                  </a>
                </div>
              </>
            )}
            {walletInfo && (
              <>
                <div>
                  <p className="text-xs text-slate-400 mb-1">ETH Balance</p>
                  <p className="text-sm font-mono text-slate-800 font-semibold">{walletInfo.ethBalance} ETH</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">USDT Balance</p>
                  <p className="text-sm font-mono text-slate-800 font-semibold">{walletInfo.usdtBalance} USDT</p>
                </div>
              </>
            )}
            {contractInfo && (
              <div>
                <p className="text-xs text-slate-400 mb-1">USDT Contract</p>
                <a
                  href={`${EXPLORER}/address/${contractInfo.usdtContractAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-mono text-slate-800 hover:text-orange-600"
                >
                  {contractInfo.usdtContractAddress}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Row */}
      {stats && <StatsBar stats={stats} auditLog={auditLog} />}

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TransactionLog entries={auditLog} />
        <SpendingChart auditLog={auditLog} />
      </div>
    </div>
  )
}
