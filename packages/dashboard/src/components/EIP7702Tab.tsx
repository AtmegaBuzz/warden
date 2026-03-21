import {
  ArrowRight, Shield, Undo2, ExternalLink,
  Key, Timer, DollarSign, Lock,
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

const CONTRACT_ADDRESS = '0xB40881D3066134514e9CD4CD0B848C49ba7Fe8d0'
const ETHERSCAN_URL = `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`

const CONTRACT_FUNCTIONS_LEFT = [
  'initializePolicy',
  'createSessionKey',
  'revokeSessionKey',
  'validateTransaction',
] as const

const CONTRACT_FUNCTIONS_RIGHT = [
  'execute',
  'executeBatch',
  'freeze',
  'unfreeze',
  'initiateRecovery',
  'executeRecovery',
] as const

interface StepProps {
  number: number
  title: string
  diagram: React.ReactNode
  description: string
}

function StepCard({ number, title, diagram, description }: StepProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-orange-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
          {number}
        </div>
        <h3 className="font-semibold text-slate-800">{title}</h3>
      </div>
      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-4 overflow-x-auto">
        {diagram}
      </div>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  )
}

function DiagramBox({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono whitespace-nowrap ${
      accent
        ? 'bg-orange-50 border-orange-300 text-orange-800'
        : 'bg-white border-slate-300 text-slate-700'
    }`}>
      {children}
    </span>
  )
}

function DiagramArrow({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1 shrink-0">
      <span className="w-4 h-px bg-slate-400 inline-block" />
      <ArrowRight className="w-3 h-3 text-slate-400" />
      {label && <span className="text-[10px] text-slate-400 font-mono">{label}</span>}
    </span>
  )
}

export function EIP7702Tab(): React.JSX.Element {
  return (
    <div className="space-y-10">
      {/* Section A: What is EIP-7702? */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">What is EIP-7702?</h2>
        <p className="text-sm text-slate-500 mb-6">
          EOA delegation in 3 steps: assign smart contract logic to your existing wallet address.
        </p>
        <div className="space-y-4">
          <StepCard
            number={1}
            title="Normal EOA"
            diagram={
              <div className="flex items-center gap-2 flex-wrap">
                <DiagramBox>Agent Wallet (EOA)</DiagramBox>
                <DiagramArrow />
                <DiagramBox>Blockchain</DiagramBox>
              </div>
            }
            description="No rules. No limits. Full access to everything. If compromised, all funds at risk."
          />
          <StepCard
            number={2}
            title="After EIP-7702 Delegation"
            diagram={
              <div className="flex items-center gap-2 flex-wrap">
                <DiagramBox>Agent Wallet (EOA)</DiagramBox>
                <DiagramArrow label="type 0x04" />
                <DiagramBox accent>PolicyDelegate Contract</DiagramBox>
                <DiagramArrow label="validates" />
                <DiagramBox>Blockchain</DiagramBox>
              </div>
            }
            description="Same address. Smart contract logic enforces rules. Every transaction validated on-chain."
          />
          <StepCard
            number={3}
            title="Revocation"
            diagram={
              <div className="flex items-center gap-2 flex-wrap">
                <DiagramBox>Agent Wallet</DiagramBox>
                <DiagramArrow label="delegate to 0x0" />
                <DiagramBox>Back to normal EOA</DiagramBox>
              </div>
            }
            description="Fully reversible. Delegate to address(0) to remove all restrictions."
          />
        </div>
      </section>

      {/* Section B: Code Spotlight */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Code Spotlight</h2>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm font-mono leading-relaxed">
            <code className="text-emerald-300">{DELEGATION_CODE}</code>
          </pre>
        </div>
        <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <p className="text-sm text-orange-800">
            <span className="font-semibold">ethers.js v6 cannot do this.</span>{' '}
            We use viem because it is the only JavaScript library with native EIP-7702 support (signAuthorization + authorizationList for type 0x04 transactions).
          </p>
        </div>
      </section>

      {/* Section C: Contract Details */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Deployed Contract</h2>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-xs text-slate-400 mb-1">Contract Address</p>
              <p className="text-sm font-mono text-slate-700 break-all">{CONTRACT_ADDRESS}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Network</p>
              <p className="text-sm text-slate-700">Sepolia</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Version</p>
              <p className="text-sm font-mono text-slate-700">Warden-PolicyDelegate-v2</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Etherscan</p>
              <a
                href={ETHERSCAN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-orange-600 hover:text-orange-700 inline-flex items-center gap-1"
              >
                View on Etherscan
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-600 mb-3">Key Functions</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                {CONTRACT_FUNCTIONS_LEFT.map(fn => (
                  <div key={fn} className="text-xs font-mono bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-slate-700">
                    {fn}
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                {CONTRACT_FUNCTIONS_RIGHT.map(fn => (
                  <div key={fn} className="text-xs font-mono bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-slate-700">
                    {fn}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section D: Session Keys */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Session Keys</h2>
        <p className="text-sm text-slate-500 mb-6">
          Scoped, time-limited permissions that let agents transact without holding the owner's private key.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {([
            {
              step: 1,
              icon: Key,
              title: 'Owner Creates Key',
              description: 'Owner creates a session key with scoped permissions: maxPerTx, dailyLimit, validUntil, and cooldown.',
            },
            {
              step: 2,
              icon: Undo2,
              title: 'Agent Authorizes',
              description: 'Agent uses the session key to authorize transactions within its scoped limits.',
            },
            {
              step: 3,
              icon: Shield,
              title: 'Contract Validates',
              description: 'PolicyDelegate validates each transaction against the session key\'s spending limits and time constraints.',
            },
            {
              step: 4,
              icon: Lock,
              title: 'Expiry / Revocation',
              description: 'If the key expires or is revoked by the owner, all future transactions from that key are blocked.',
            },
          ] as const).map(({ step, icon: Icon, title, description }) => (
            <div key={step} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {step}
                </div>
                <Icon className="w-4 h-4 text-orange-600" />
              </div>
              <h3 className="font-semibold text-slate-800 text-sm mb-2">{title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <p className="text-xs font-semibold text-slate-600 mb-3">Session Key Parameters</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { icon: DollarSign, label: 'maxPerTx', desc: 'Max per transaction' },
              { icon: DollarSign, label: 'dailyLimit', desc: 'Rolling 24h cap' },
              { icon: Timer, label: 'validUntil', desc: 'Expiration timestamp' },
              { icon: Timer, label: 'cooldown', desc: 'Min time between txs' },
            ] as const).map(({ icon: Icon, label, desc }) => (
              <div key={label} className="bg-slate-50 rounded-lg border border-slate-200 p-3 text-center">
                <Icon className="w-4 h-4 text-orange-600 mx-auto mb-1.5" />
                <p className="text-xs font-mono font-semibold text-slate-700">{label}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
