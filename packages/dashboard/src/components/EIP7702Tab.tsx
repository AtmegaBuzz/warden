import {
  ArrowRight, ArrowDown, Shield, Undo2, ExternalLink,
  Key, Timer, DollarSign, Lock, Zap,
  FileCheck, Layers, Fingerprint, Frame,
  CheckCircle, Activity, AlertTriangle, Users, Globe,
} from 'lucide-react'

const DELEGATION_CODE = `// This is REAL code from our EIP7702Manager.ts

// Step 1: Sign authorization to delegate
const authorization = await walletClient.signAuthorization({
  account,
  contractAddress: POLICY_DELEGATE_ADDRESS,
});

// Step 2: Send type 0x04 transaction
const hash = await walletClient.sendTransaction({
  account,
  authorizationList: [authorization],
  to: account.address, // self-call triggers delegation
  data: '0x',
});

// Step 3: Wait for confirmation
const receipt = await publicClient.waitForTransactionReceipt({ hash });`

const CONTRACT_ADDRESS = '0xB40881D3066134514e9ec4CD0B848C49ba7Fe8d0'

const ALL_CONTRACT_FUNCTIONS = [
  { name: 'initializePolicy', category: 'Core', color: 'bg-orange-100 text-orange-700' },
  { name: 'createSessionKey', category: 'Session Keys', color: 'bg-blue-100 text-blue-700' },
  { name: 'revokeSessionKey', category: 'Session Keys', color: 'bg-blue-100 text-blue-700' },
  { name: 'validateTransaction', category: 'Core', color: 'bg-orange-100 text-orange-700' },
  { name: 'execute', category: 'Execution', color: 'bg-emerald-100 text-emerald-700' },
  { name: 'executeBatch', category: 'Execution', color: 'bg-emerald-100 text-emerald-700' },
  { name: 'execute (ERC-7821)', category: 'ERC-7821', color: 'bg-purple-100 text-purple-700' },
  { name: 'redeemDelegations', category: 'ERC-7710', color: 'bg-cyan-100 text-cyan-700' },
  { name: 'supportsInterface', category: 'ERC-165', color: 'bg-slate-100 text-slate-700' },
  { name: 'freeze', category: 'Emergency', color: 'bg-red-100 text-red-700' },
  { name: 'unfreeze', category: 'Emergency', color: 'bg-red-100 text-red-700' },
  { name: 'initiateRecovery', category: 'Recovery', color: 'bg-amber-100 text-amber-700' },
  { name: 'executeRecovery', category: 'Recovery', color: 'bg-amber-100 text-amber-700' },
  { name: 'getSessionKeyList', category: 'View', color: 'bg-slate-100 text-slate-600' },
  { name: 'getRemainingBudget', category: 'View', color: 'bg-slate-100 text-slate-600' },
  { name: 'getPolicy', category: 'View', color: 'bg-slate-100 text-slate-600' },
] as const

function FlowBox({ children, accent, icon: Icon }: { children: React.ReactNode; accent?: string; icon?: React.ComponentType<{ className?: string }> }) {
  const base = accent || 'bg-white border-slate-300 text-slate-800'
  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold whitespace-nowrap ${base}`}>
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </div>
  )
}

function FlowArrow({ label, direction = 'right' }: { label?: string; direction?: 'right' | 'down' }) {
  if (direction === 'down') {
    return (
      <div className="flex flex-col items-center py-2">
        <div className="w-[3px] h-6 bg-orange-400 rounded-full" />
        <ArrowDown className="w-5 h-5 text-orange-500" strokeWidth={3} />
        {label && <span className="text-[10px] text-orange-500 font-mono font-semibold mt-0.5">{label}</span>}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1 px-1 shrink-0">
      <div className="w-6 h-[3px] bg-orange-400 rounded-full" />
      <ArrowRight className="w-5 h-5 text-orange-500" strokeWidth={3} />
      {label && <span className="text-[10px] text-orange-500 font-mono font-semibold">{label}</span>}
    </div>
  )
}

export function EIP7702Tab(): React.JSX.Element {
  return (
    <div className="space-y-10">

      {/* Section A: What is EIP-7702? — 3 steps */}
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">What is EIP-7702?</h2>
        <p className="text-sm text-slate-500 mb-6">
          EOA delegation in 3 steps: assign smart contract logic to your existing wallet address.
        </p>

        <div className="space-y-4">
          {/* Step 1 */}
          <div className="bg-white rounded-xl border-2 border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center text-sm font-bold">1</div>
              <h3 className="text-lg font-bold text-slate-900">Normal EOA — No Protection</h3>
            </div>
            <div className="bg-red-50 rounded-xl border-2 border-red-200 p-5 mb-4">
              <div className="flex items-center gap-3 justify-center flex-wrap">
                <FlowBox icon={Users} accent="bg-blue-50 border-blue-300 text-blue-800">Agent Wallet (EOA)</FlowBox>
                <FlowArrow />
                <FlowBox icon={Globe} accent="bg-slate-100 border-slate-300 text-slate-700">Blockchain</FlowBox>
              </div>
            </div>
            <p className="text-sm text-red-700 font-medium">No rules. No limits. Full access to everything. If compromised, all funds are drained instantly.</p>
          </div>

          {/* Step 2 — THE BIG ONE */}
          <div className="bg-white rounded-xl border-2 border-emerald-300 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm font-bold">2</div>
              <h3 className="text-lg font-bold text-slate-900">After EIP-7702 Delegation — Full Protection</h3>
              <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full">CLAWVAULT</span>
            </div>
            <div className="bg-emerald-50 rounded-xl border-2 border-emerald-200 p-5 mb-4">
              {/* Main flow */}
              <div className="flex items-center gap-2 justify-center flex-wrap mb-4">
                <FlowBox icon={Users} accent="bg-blue-50 border-blue-300 text-blue-800">Agent Wallet (EOA)</FlowBox>
                <FlowArrow label="type 0x04" />
                <FlowBox icon={Shield} accent="bg-orange-50 border-orange-400 text-orange-800">PolicyDelegate</FlowBox>
                <FlowArrow label="validates" />
                <FlowBox icon={Globe} accent="bg-emerald-50 border-emerald-400 text-emerald-800">Blockchain</FlowBox>
              </div>

              <FlowArrow direction="down" />

              {/* What PolicyDelegate enforces */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  { icon: DollarSign, label: 'Spending Limits', sub: 'Per-tx + daily caps' },
                  { icon: Key, label: 'Session Keys', sub: 'ERC-7710 delegations' },
                  { icon: Activity, label: 'Risk Scoring', sub: '0-100 per transaction' },
                  { icon: AlertTriangle, label: 'Anomaly Detection', sub: 'Velocity + diversity' },
                  { icon: Lock, label: 'Emergency Freeze', sub: 'Instant kill-switch' },
                ].map(item => (
                  <div key={item.label} className="bg-white rounded-lg border border-emerald-200 p-2.5 text-center">
                    <item.icon className="w-4 h-4 text-orange-600 mx-auto mb-1" />
                    <p className="text-xs font-bold text-slate-800">{item.label}</p>
                    <p className="text-[10px] text-slate-500">{item.sub}</p>
                  </div>
                ))}
              </div>

              <FlowArrow direction="down" />

              {/* Standards implemented */}
              <div className="flex flex-wrap gap-2 justify-center">
                <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">EIP-7702</span>
                <span className="bg-cyan-500 text-white text-xs font-bold px-3 py-1 rounded-full">ERC-7710</span>
                <span className="bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full">ERC-7715</span>
                <span className="bg-purple-500 text-white text-xs font-bold px-3 py-1 rounded-full">ERC-7821</span>
                <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">ERC-8004</span>
                <span className="bg-slate-500 text-white text-xs font-bold px-3 py-1 rounded-full">ERC-165</span>
              </div>
            </div>
            <p className="text-sm text-emerald-700 font-medium">Same address. Smart contract logic enforces 10 policy rules. Every transaction validated on-chain. 6 standards implemented.</p>
          </div>

          {/* Step 3 */}
          <div className="bg-white rounded-xl border-2 border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-slate-600 text-white flex items-center justify-center text-sm font-bold">3</div>
              <h3 className="text-lg font-bold text-slate-900">Revocation — Back to Normal</h3>
            </div>
            <div className="bg-slate-50 rounded-xl border-2 border-slate-200 p-5 mb-4">
              <div className="flex items-center gap-3 justify-center flex-wrap">
                <FlowBox icon={Users}>Agent Wallet</FlowBox>
                <FlowArrow label="delegate to 0x0" />
                <FlowBox icon={Undo2}>Back to normal EOA</FlowBox>
              </div>
            </div>
            <p className="text-sm text-slate-600">Fully reversible. Delegate to address(0) to remove all restrictions. Unlike ERC-4337, no permanent migration.</p>
          </div>
        </div>
      </section>

      {/* Section B: Code Spotlight */}
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Code Spotlight — Real viem Implementation</h2>
        <div className="bg-slate-900 rounded-xl p-5 overflow-x-auto border-2 border-slate-700">
          <pre className="text-sm font-mono leading-relaxed">
            <code className="text-emerald-300">{DELEGATION_CODE}</code>
          </pre>
        </div>
        <div className="mt-4 bg-orange-50 border-2 border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <p className="text-sm text-orange-800">
            <span className="font-bold">ethers.js v6 cannot do this.</span>{' '}
            We use viem because it is the only JavaScript library with native EIP-7702 support (signAuthorization + authorizationList for type 0x04 transactions).
          </p>
        </div>
      </section>

      {/* Section C: Contract Details */}
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Deployed Contract — 46 Tests Passing</h2>
        <div className="bg-white rounded-xl border-2 border-slate-200 shadow-sm p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-xs text-slate-400 mb-1">Contract Address</p>
              <p className="text-sm font-mono text-slate-700">{CONTRACT_ADDRESS.slice(0, 10)}...{CONTRACT_ADDRESS.slice(-4)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Network</p>
              <p className="text-sm font-semibold text-slate-700">Sepolia (Prague EVM)</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Version</p>
              <p className="text-sm font-mono text-slate-700">PolicyDelegate-v2</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Etherscan</p>
              <a
                href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-orange-600 hover:text-orange-700 font-semibold inline-flex items-center gap-1"
              >
                Verify ↗ <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <p className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-wider">16 Contract Functions</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
            {ALL_CONTRACT_FUNCTIONS.map(fn => (
              <div key={fn.name} className={`text-xs font-mono rounded-lg px-3 py-2 border ${fn.color}`}>
                <span className="font-semibold">{fn.name}</span>
                <span className="text-[9px] opacity-60 ml-1">{fn.category}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section D: Session Keys */}
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Session Keys — Scoped Agent Permissions</h2>
        <p className="text-sm text-slate-500 mb-6">
          Time-limited permissions that let agents transact without holding the owner's private key.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {([
            { step: 1, icon: Key, title: 'Owner Creates Key', description: 'Creates session key with maxPerTx, dailyLimit, validUntil, and cooldown.', accent: 'border-blue-300 bg-blue-50' },
            { step: 2, icon: Zap, title: 'Agent Transacts', description: 'Agent uses session key to authorize transactions within its scoped limits.', accent: 'border-amber-300 bg-amber-50' },
            { step: 3, icon: Shield, title: 'Contract Validates', description: 'PolicyDelegate checks every tx against session key limits on-chain.', accent: 'border-emerald-300 bg-emerald-50' },
            { step: 4, icon: Lock, title: 'Expires / Revoked', description: 'Key expires or owner revokes it. All future agent transactions blocked.', accent: 'border-red-300 bg-red-50' },
          ] as const).map(({ step, icon: Icon, title, description, accent }) => (
            <div key={step} className={`rounded-xl border-2 ${accent} p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold">{step}</div>
                <Icon className="w-4 h-4 text-orange-600" />
              </div>
              <h3 className="font-bold text-slate-800 text-sm mb-1">{title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 bg-white rounded-xl border-2 border-slate-200 shadow-sm p-5">
          <p className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-wider">Session Key Parameters</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { icon: DollarSign, label: 'maxPerTx', desc: 'Max spend per transaction' },
              { icon: DollarSign, label: 'dailyLimit', desc: 'Rolling 24h spending cap' },
              { icon: Timer, label: 'validUntil', desc: 'Expiration timestamp' },
              { icon: Timer, label: 'cooldownSeconds', desc: 'Min time between txs' },
            ] as const).map(({ icon: Icon, label, desc }) => (
              <div key={label} className="bg-slate-50 rounded-lg border border-slate-200 p-3 text-center">
                <Icon className="w-4 h-4 text-orange-600 mx-auto mb-1" />
                <p className="text-xs font-mono font-bold text-slate-700">{label}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section E: Related Standards */}
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Standards We Implement</h2>
        <p className="text-sm text-slate-500 mb-6">
          ClawVault builds on a composable stack of 6 EIPs and ERCs.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {([
            {
              icon: FileCheck, standard: 'ERC-7710', title: 'Smart Contract Delegation',
              detail: 'redeemDelegations() validates authority before execution. Interoperable with MetaMask Delegation Toolkit.',
              status: 'implemented' as const, color: 'border-cyan-300',
            },
            {
              icon: Key, standard: 'ERC-7715', title: 'Permission Granting',
              detail: 'wallet_grantPermissions pattern — agents request scoped spending limits, time windows, contract allowlists.',
              status: 'implemented' as const, color: 'border-blue-300',
            },
            {
              icon: Layers, standard: 'ERC-7821', title: 'Batch Executor',
              detail: 'execute(mode, data) — atomic multi-call: approve + swap in one tx. Each call policy-validated.',
              status: 'implemented' as const, color: 'border-purple-300',
            },
            {
              icon: Fingerprint, standard: 'ERC-8004', title: 'Trustless Agents',
              detail: 'On-chain identity NFTs + reputation scoring. Gates delegation authority based on agent trust.',
              status: 'implemented' as const, color: 'border-emerald-300',
              extra: 'Identity: 0x8004A169... | Reputation: 0x8004BAa1...',
            },
            {
              icon: CheckCircle, standard: 'ERC-165', title: 'Interface Detection',
              detail: 'supportsInterface() for 7821, 7710, 165. Wallets auto-detect ClawVault capabilities.',
              status: 'implemented' as const, color: 'border-slate-300',
            },
            {
              icon: Frame, standard: 'EIP-8141', title: 'Frame Transactions',
              detail: 'Native AA via frame-based transactions. ClawVault policies become validation frames when Hegota fork lands H2 2026.',
              status: 'future' as const, color: 'border-slate-300',
            },
          ] as const).map(card => {
            const Icon = card.icon
            const isImpl = card.status === 'implemented'
            return (
              <div key={card.standard} className={`bg-white rounded-xl border-2 ${card.color} shadow-sm p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Icon className="w-4 h-4 text-orange-600" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-orange-600">{card.standard}</span>
                      <h3 className="font-bold text-slate-800 text-sm">{card.title}</h3>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isImpl ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {isImpl ? '✓ Implemented' : 'Roadmap'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{card.detail}</p>
                {'extra' in card && card.extra && (
                  <p className="text-[10px] font-mono text-slate-400 mt-2">{card.extra}</p>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
