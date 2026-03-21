import { useState } from 'react'
import { TopBar } from './components/TopBar'
import { TabNav, type Tab } from './components/TabNav'
import { SimulatorTab } from './components/SimulatorTab'
import { LiveDashboardTab } from './components/LiveDashboardTab'
import { ArchitectureTab } from './components/ArchitectureTab'
import { EIP7702Tab } from './components/EIP7702Tab'
import { AuditLogTab } from './components/AuditLogTab'
import { useWarden } from './hooks/useClawVault'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('Simulator')

  const {
    stats, auditLog, error, lastUpdate,
    walletInfo, contractInfo,
    simulateTransaction,
    freezeAgent, unfreezeAgent,
  } = useWarden(null)

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar connected={!error} />
      <TabNav active={activeTab} onChange={setActiveTab} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'Simulator' && (
          <SimulatorTab
            onSimulate={simulateTransaction}
            auditLog={auditLog}
          />
        )}

        {activeTab === 'Live Dashboard' && (
          <LiveDashboardTab
            stats={stats}
            auditLog={auditLog}
            walletInfo={walletInfo}
            contractInfo={contractInfo}
            onFreeze={freezeAgent}
            onUnfreeze={unfreezeAgent}
            onSimulate={simulateTransaction}
          />
        )}

        {activeTab === 'Architecture' && (
          <ArchitectureTab />
        )}

        {activeTab === 'EIP-7702' && (
          <EIP7702Tab />
        )}

        {activeTab === 'Audit Log' && (
          <AuditLogTab auditLog={auditLog} />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="text-center md:text-left">
              <p className="text-xs text-slate-400 font-mono">
                Built with Tether WDK + EIP-7702 + OpenClaw | Hackathon Galactica 2026
              </p>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                PolicyDelegate: 0xB408...e8d0 | Sepolia USDT: 0x7169...BA06
              </p>
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Last update: {lastUpdate.toLocaleTimeString()} | Polling every 3s
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
