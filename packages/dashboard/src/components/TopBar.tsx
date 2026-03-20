import { Shield, ExternalLink } from 'lucide-react'

const POLICY_DELEGATE = '0xB40881D3066134514e9ec4CD0B848C49ba7Fe8d0'

interface Props {
  connected: boolean
}

export function TopBar({ connected }: Props) {
  return (
    <header className="bg-white border-b-2 border-slate-200">
      <div className="px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Logo + Name */}
          <div className="flex items-center gap-3">
            <div className="bg-orange-600 rounded-xl p-2.5 shadow-sm">
              <Shield className="w-7 h-7 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight leading-none">
                Warden
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                The firewall for AI agent wallets
              </p>
            </div>
          </div>

          {/* Right: Network + Contract */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-slate-200 bg-slate-50">
              {connected ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              )}
              <span className="text-sm text-slate-700 font-semibold">Sepolia</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 font-mono leading-tight">
                {POLICY_DELEGATE.slice(0, 6)}...{POLICY_DELEGATE.slice(-4)}
              </p>
              <a
                href={`https://sepolia.etherscan.io/address/${POLICY_DELEGATE}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-orange-600 hover:text-orange-700 font-semibold inline-flex items-center gap-1"
              >
                Etherscan <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
