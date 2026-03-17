import { ExternalLink, Copy } from 'lucide-react'
import { useState } from 'react'

interface ContractInfo {
  policyDelegateAddress: string
  usdtContractAddress: string
  deployerAddress: string
  network: string
  version: string
}

interface Props {
  contractInfo: ContractInfo | null
}

const EXPLORER = 'https://sepolia.etherscan.io'

const KEY_FUNCTIONS = [
  { name: 'initializePolicy', desc: 'Set up initial policy rules for an agent wallet' },
  { name: 'createSessionKey', desc: 'Create a time-bounded session key for the agent' },
  { name: 'revokeSessionKey', desc: 'Immediately revoke an active session key' },
  { name: 'validateTransaction', desc: 'Evaluate a transaction against all 10 policy rules' },
  { name: 'execute', desc: 'Execute a single validated transaction' },
  { name: 'executeBatch', desc: 'Execute multiple validated transactions atomically' },
  { name: 'freeze', desc: 'Halt all operations for an agent wallet' },
  { name: 'unfreeze', desc: 'Resume operations for a frozen agent wallet' },
  { name: 'initiateRecovery', desc: 'Begin the recovery process with a timelock' },
  { name: 'executeRecovery', desc: 'Complete recovery after timelock expires' },
] as const

function AddressRow({ label, address }: { label: string; address: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        <p className="text-sm font-mono text-slate-800">{address}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => void handleCopy()}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          title="Copy address"
        >
          <Copy className="w-4 h-4" />
          {copied && <span className="text-xs text-emerald-600 ml-1">Copied</span>}
        </button>
        <a
          href={`${EXPLORER}/address/${address}`}
          target="_blank"
          rel="noreferrer"
          className="text-orange-600 hover:text-orange-700 transition-colors"
          title="View on Etherscan"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  )
}

export function ContractsTab({ contractInfo }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Deployed Contracts</h2>
        <p className="text-sm text-slate-500">
          ClawVault smart contracts deployed on Sepolia testnet.
        </p>
      </div>

      {contractInfo ? (
        <>
          {/* Contract Addresses */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
              Contract Addresses
            </h3>
            <AddressRow label="PolicyDelegate" address={contractInfo.policyDelegateAddress} />
            <AddressRow label="USDT Contract" address={contractInfo.usdtContractAddress} />
            <AddressRow label="Deployer Wallet" address={contractInfo.deployerAddress} />
          </div>

          {/* Network Info */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
              Network Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-400 mb-1">Network</p>
                <p className="text-sm font-mono text-slate-800 font-semibold">Sepolia</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-400 mb-1">Contract Version</p>
                <p className="text-sm font-mono text-slate-800 font-semibold">{contractInfo.version || 'ClawVault-PolicyDelegate-v2'}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-400 mb-1">Chain ID</p>
                <p className="text-sm font-mono text-slate-800 font-semibold">11155111</p>
              </div>
            </div>
          </div>

          {/* Key Functions */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
              Key Functions
            </h3>
            <div className="space-y-2">
              {KEY_FUNCTIONS.map(fn => (
                <div key={fn.name} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
                  <code className="text-sm font-mono text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 flex-shrink-0">
                    {fn.name}
                  </code>
                  <span className="text-sm text-slate-600">{fn.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* USDT Faucet */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
              Test USDT Faucet
            </h3>
            <p className="text-sm text-slate-600 mb-3">
              Get test USDT on Sepolia by calling the faucet function on the USDT contract.
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 mb-4">
              <p className="text-xs text-slate-400 mb-1 font-medium">Call this function</p>
              <p className="text-sm font-mono text-slate-800">_giveMeATokens(1000000000)</p>
              <p className="text-xs text-slate-500 mt-1">Mints 1,000 USDT to your address</p>
            </div>
            <a
              href={`${EXPLORER}/address/${contractInfo.usdtContractAddress}#writeContract`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              Open on Etherscan
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
          <p className="text-slate-400">Loading contract information...</p>
          <p className="text-xs text-slate-400 mt-2">
            Make sure the API server is running at the configured endpoint.
          </p>
        </div>
      )}
    </div>
  )
}
