import { useState } from 'react'
import {
  Bot, Server, Shield, FileText, Key, Cpu,
  Wallet, Code2, Link, Layers, Wrench, Blocks,
  ChevronDown, ChevronUp, ArrowDown, ArrowRight,
} from 'lucide-react'

type ExpandedBox = 'mcp' | 'policyEngine' | 'eip7702' | 'contract' | null

const MCP_TOOLS = [
  'clawvault_create_wallet', 'clawvault_get_balance', 'clawvault_transfer',
  'clawvault_get_policy_status', 'clawvault_get_audit_log', 'clawvault_update_policy',
  'clawvault_freeze', 'clawvault_unfreeze', 'clawvault_create_session_key',
  'clawvault_revoke_session_key', 'clawvault_register_identity',
] as const

const POLICY_RULES = [
  'maxPerTx', 'dailyLimit', 'cooldown', 'blockedTokens', 'allowedTokens',
  'blockedRecipients', 'allowedRecipients', 'allowedChains',
  'anomalyDetection', 'requireApproval',
] as const

const EIP7702_METHODS = [
  'delegateToPolicy', 'initializePolicy', 'createSessionKey', 'revokeSessionKey',
  'validateOnChain', 'executeViaPolicy', 'freeze', 'unfreeze', 'revokeDelegation',
] as const

const CONTRACT_FUNCTIONS = [
  'initializePolicy', 'createSessionKey', 'revokeSessionKey',
  'validateTransaction', 'execute', 'executeBatch',
  'freeze', 'unfreeze', 'initiateRecovery', 'executeRecovery',
] as const

interface ArchBoxProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  bullets: string[]
  expandKey: ExpandedBox
  expanded: ExpandedBox
  onToggle: (key: ExpandedBox) => void
  bg: string
  iconBg: string
  iconColor: string
  borderColor: string
  titleColor: string
}

function ArchBox({ icon: Icon, title, bullets, expandKey, expanded, onToggle, bg, iconBg, iconColor, borderColor, titleColor }: ArchBoxProps) {
  const isOpen = expanded === expandKey
  const canExpand = expandKey !== null

  return (
    <button
      type="button"
      onClick={() => canExpand && onToggle(isOpen ? null : expandKey)}
      className={`${bg} rounded-xl border-2 ${borderColor} p-5 text-left transition-all w-full ${canExpand ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2.5 ${iconBg} rounded-lg`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <h3 className={`font-bold ${titleColor} text-sm`}>{title}</h3>
        </div>
        {canExpand && (
          isOpen
            ? <ChevronUp className="w-4 h-4 text-slate-500 mt-1" />
            : <ChevronDown className="w-4 h-4 text-slate-500 mt-1" />
        )}
      </div>
      <ul className="space-y-1.5">
        {bullets.map(b => (
          <li key={b} className="text-xs text-slate-600 flex items-start gap-2">
            <span className="text-slate-400 mt-0.5 text-[8px]">&#9679;</span>
            {b}
          </li>
        ))}
      </ul>
    </button>
  )
}

function ExpandedPanel({ title, items, color }: { title: string; items: readonly string[]; color: string }) {
  return (
    <div className={`${color} rounded-lg border border-slate-200 p-4 mt-2`}>
      <p className="text-xs font-bold text-slate-700 mb-2">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {items.map(item => (
          <span key={item} className="text-xs font-mono bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 shadow-sm">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}


function ArchitectureDiagram() {
  const [expanded, setExpanded] = useState<ExpandedBox>(null)

  return (
    <div className="relative">
      {/* Continuous vertical spine line behind everything */}
      <div className="absolute left-1/2 top-0 bottom-0 w-[3px] bg-gradient-to-b from-blue-300 via-orange-400 to-slate-700 -translate-x-1/2 rounded-full" style={{ zIndex: 0 }} />

      <div className="relative" style={{ zIndex: 1 }}>

        {/* === LAYER 1: AGENT === */}
        <div className="relative mb-2">
          <div className="flex items-center gap-3 mb-4 justify-center">
            <div className="bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full shadow">
              1. Agent Layer
            </div>
          </div>
          <div className="bg-blue-50 rounded-2xl border-2 border-blue-200 p-4">
            <div className="flex flex-col lg:flex-row items-stretch gap-3">
              <div className="flex-1">
                <ArchBox icon={Bot} title="AI Agent (OpenClaw)"
                  bullets={['LLM-powered autonomous agent', 'Calls MCP tools to transact', 'Scoped by PolicyEngine rules']}
                  expandKey={null} expanded={expanded} onToggle={setExpanded}
                  bg="bg-white" iconBg="bg-blue-600" iconColor="text-white" borderColor="border-blue-300" titleColor="text-blue-900"
                />
              </div>
              <div className="hidden lg:flex items-center shrink-0">
                <div className="w-8 h-[3px] bg-blue-400 rounded-full" />
                <ArrowRight className="w-5 h-5 text-blue-500" strokeWidth={3} />
              </div>
              <div className="flex-[1.6]">
                <ArchBox icon={Server} title="ClawVault MCP Server (11 tools)"
                  bullets={['Model Context Protocol interface', 'Agent management + policy CRUD', 'Transaction simulation + execution']}
                  expandKey="mcp" expanded={expanded} onToggle={setExpanded}
                  bg="bg-white" iconBg="bg-orange-600" iconColor="text-white" borderColor="border-orange-300" titleColor="text-orange-900"
                />
                {expanded === 'mcp' && <ExpandedPanel title="All 11 MCP Tools" items={MCP_TOOLS} color="bg-orange-50" />}
              </div>
              <div className="hidden lg:flex items-center shrink-0">
                <div className="w-8 h-[3px] bg-blue-400 rounded-full" />
                <ArrowRight className="w-5 h-5 text-blue-500" strokeWidth={3} />
              </div>
              <div className="flex-1">
                <ArchBox icon={Wallet} title="PolicyAccount"
                  bullets={['Per-agent wallet instance', 'Tether WDK BIP-39/44 derived', 'Holds funds + signs transactions']}
                  expandKey={null} expanded={expanded} onToggle={setExpanded}
                  bg="bg-white" iconBg="bg-emerald-600" iconColor="text-white" borderColor="border-emerald-300" titleColor="text-emerald-900"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Spine arrow */}
        <div className="flex justify-center py-1">
          <ArrowDown className="w-7 h-7 text-orange-500 bg-white rounded-full p-0.5 shadow" strokeWidth={3} />
        </div>

        {/* === LAYER 2: POLICY === */}
        <div className="relative mb-2">
          <div className="flex items-center gap-3 mb-4 justify-center">
            <div className="bg-amber-600 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full shadow">
              2. Policy Layer (Off-Chain)
            </div>
          </div>
          <div className="bg-amber-50 rounded-2xl border-2 border-amber-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <ArchBox icon={Shield} title="PolicyEngine (10 rules)"
                  bullets={['Off-chain TypeScript validation', 'Sub-millisecond evaluation', 'Risk scoring 0-100 per transaction']}
                  expandKey="policyEngine" expanded={expanded} onToggle={setExpanded}
                  bg="bg-white" iconBg="bg-amber-600" iconColor="text-white" borderColor="border-amber-300" titleColor="text-amber-900"
                />
                {expanded === 'policyEngine' && <ExpandedPanel title="All 10 Policy Rules" items={POLICY_RULES} color="bg-amber-50" />}
              </div>
              <div>
                <ArchBox icon={FileText} title="AuditLogger"
                  bullets={['Logs every transaction attempt', 'Captures approve/deny + reason + risk', 'Filterable, exportable via API']}
                  expandKey={null} expanded={expanded} onToggle={setExpanded}
                  bg="bg-white" iconBg="bg-purple-600" iconColor="text-white" borderColor="border-purple-300" titleColor="text-purple-900"
                />
              </div>
              <div>
                <ArchBox icon={Key} title="EIP7702Manager (viem)"
                  bullets={['EOA delegation management', 'Session key lifecycle', 'Freeze / recovery operations']}
                  expandKey="eip7702" expanded={expanded} onToggle={setExpanded}
                  bg="bg-white" iconBg="bg-cyan-600" iconColor="text-white" borderColor="border-cyan-300" titleColor="text-cyan-900"
                />
                {expanded === 'eip7702' && <ExpandedPanel title="Key Methods" items={EIP7702_METHODS} color="bg-cyan-50" />}
              </div>
            </div>
          </div>
        </div>

        {/* Spine arrow */}
        <div className="flex justify-center py-1">
          <ArrowDown className="w-7 h-7 text-orange-500 bg-white rounded-full p-0.5 shadow" strokeWidth={3} />
        </div>

        {/* === LAYER 3: EXECUTION === */}
        <div className="relative mb-2">
          <div className="flex items-center gap-3 mb-4 justify-center">
            <div className="bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full shadow">
              3. Execution Layer (On-Chain)
            </div>
          </div>
          <div className="bg-emerald-50 rounded-2xl border-2 border-emerald-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <ArchBox icon={Wallet} title="Tether WDK (wallet)"
                  bullets={['Self-custodial key management', 'BIP-39 mnemonic + BIP-44 derivation', '20+ chain support']}
                  expandKey={null} expanded={expanded} onToggle={setExpanded}
                  bg="bg-white" iconBg="bg-teal-600" iconColor="text-white" borderColor="border-teal-300" titleColor="text-teal-900"
                />
              </div>
              <div>
                <ArchBox icon={Code2} title="PolicyDelegate.sol (on-chain)"
                  bullets={['EIP-7702 delegate contract', 'Session keys + spending limits + allowlists', 'Freeze + timelocked recovery']}
                  expandKey="contract" expanded={expanded} onToggle={setExpanded}
                  bg="bg-white" iconBg="bg-rose-600" iconColor="text-white" borderColor="border-rose-300" titleColor="text-rose-900"
                />
                {expanded === 'contract' && <ExpandedPanel title="Contract Functions (29 tests passing)" items={CONTRACT_FUNCTIONS} color="bg-rose-50" />}
              </div>
            </div>
          </div>
        </div>

        {/* Spine arrow with label */}
        <div className="flex flex-col items-center py-1">
          <ArrowDown className="w-7 h-7 text-orange-500 bg-white rounded-full p-0.5 shadow" strokeWidth={3} />
          <span className="text-[10px] text-orange-600 font-mono font-bold mt-1 bg-white px-2 rounded">type 0x04 transaction</span>
        </div>

        {/* === LAYER 4: BLOCKCHAIN === */}
        <div className="flex items-center gap-3 mb-4 justify-center">
          <div className="bg-slate-800 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full shadow">
            4. Blockchain
          </div>
        </div>
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl border-2 border-slate-600 shadow-xl p-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="p-2.5 bg-orange-500 rounded-lg">
              <Blocks className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-bold text-white text-lg">Ethereum Sepolia</h3>
          </div>
          <p className="text-sm text-slate-300 mb-3">Testnet with Prague EVM (EIP-7702 support)</p>
          <div className="flex items-center justify-center gap-6">
            <a href="https://sepolia.etherscan.io/address/0xB40881D3066134514e9ec4CD0B848C49ba7Fe8d0"
              target="_blank" rel="noreferrer"
              className="text-xs font-mono text-orange-400 hover:text-orange-300 underline">
              PolicyDelegate: 0xB408...e8d0
            </a>
            <a href="https://sepolia.etherscan.io/token/0x7169D38820dfd117C3FA1f22a697dBA58d90BA06"
              target="_blank" rel="noreferrer"
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300 underline">
              USDT: 0x7169...BA06
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}

const TECH_STACK = [
  { icon: Wallet, title: 'Tether WDK', color: 'bg-teal-600',
    description: 'Self-custodial wallet SDK. BIP-39/44 key derivation. 20+ chain support. Agent wallets are non-custodial.' },
  { icon: Code2, title: 'viem', color: 'bg-cyan-600',
    description: 'Only JS library with native EIP-7702 support. signAuthorization + authorizationList for type 0x04 transactions. ethers.js v6 cannot do this.' },
  { icon: Link, title: 'EIP-7702', color: 'bg-orange-600',
    description: 'EOA delegation standard. Same address, smart contract logic, fully reversible. No bundler needed. Keeps WDK compatibility.' },
  { icon: Wrench, title: 'Solidity 0.8.28 + Hardhat', color: 'bg-rose-600',
    description: 'Prague EVM target for 7702 opcodes. PolicyDelegate contract with 29 tests passing. OpenZeppelin ReentrancyGuard.' },
  { icon: Cpu, title: 'MCP Protocol', color: 'bg-purple-600',
    description: 'Model Context Protocol for AI agent tool calling. 11 callable tools. Any MCP-compatible agent can use ClawVault.' },
  { icon: Layers, title: 'React + Vite + Tailwind', color: 'bg-blue-600',
    description: 'Interactive simulator + live dashboard. 5-tab SPA with scenario-driven demos. Recharts for data visualization.' },
] as const

export function ArchitectureTab(): React.JSX.Element {
  return (
    <div className="space-y-10">
      {/* Section A */}
      <section>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 mb-1">System Architecture</h2>
          <p className="text-sm text-slate-500">Click any box with a chevron to expand details. Each color represents a different layer.</p>
        </div>
        <ArchitectureDiagram />
      </section>

      {/* Section B */}
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Technology Stack</h2>
        <p className="text-sm text-slate-500 mb-4">Every technology was chosen for a specific reason.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TECH_STACK.map(({ icon: Icon, title, description, color }) => (
            <div key={title} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2.5 ${color} rounded-lg`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-slate-800">{title}</h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section C */}
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Two-Layer Defense</h2>
        <p className="text-sm text-slate-500 mb-4">Why ClawVault enforces policies at both layers — and what happens if one is bypassed.</p>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="bg-slate-100 px-5 py-3.5 text-left font-bold text-slate-600 text-xs uppercase tracking-wider w-1/4">&nbsp;</th>
                <th className="bg-amber-100 px-5 py-3.5 text-left font-bold text-amber-800 text-xs uppercase tracking-wider">Off-Chain (TypeScript)</th>
                <th className="bg-emerald-100 px-5 py-3.5 text-left font-bold text-emerald-800 text-xs uppercase tracking-wider">On-Chain (EIP-7702)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {([
                ['Speed', '<1ms', '~12s (block time)'],
                ['Tamper-proof', 'No (can be bypassed)', 'Yes (blockchain enforced)'],
                ['Cost', 'Free', 'Gas cost (~0.001 ETH)'],
                ['Complexity', '10 configurable rules', 'Solidity contract logic'],
                ['When blocks', 'Before tx is sent', 'Even if TypeScript bypassed'],
              ] as const).map(([label, offChain, onChain]) => (
                <tr key={label} className="hover:bg-slate-50">
                  <td className="px-5 py-3.5 font-bold text-slate-700 text-sm">{label}</td>
                  <td className="px-5 py-3.5 text-slate-700 font-mono text-sm bg-amber-50/50">{offChain}</td>
                  <td className="px-5 py-3.5 text-slate-700 font-mono text-sm bg-emerald-50/50">{onChain}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section D */}
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Why EIP-7702 over ERC-4337?</h2>
        <p className="text-sm text-slate-500 mb-4">Account abstraction comparison — ClawVault chose EIP-7702 for WDK compatibility and reversibility.</p>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="bg-slate-100 px-5 py-3.5 text-left font-bold text-slate-600 text-xs uppercase tracking-wider w-1/4">&nbsp;</th>
                <th className="bg-orange-500 px-5 py-3.5 text-left font-bold text-white text-xs uppercase tracking-wider">
                  EIP-7702 (ClawVault) &#x2713;
                </th>
                <th className="bg-slate-200 px-5 py-3.5 text-left font-bold text-slate-600 text-xs uppercase tracking-wider">ERC-4337</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {([
                ['Address', 'Keeps EOA address', 'New contract address'],
                ['Reversible', 'Yes \u2014 delegate to 0x0', 'No \u2014 permanent'],
                ['Bundler', 'Not required', 'Required'],
                ['Gas overhead', 'Minimal', '~42,000 extra gas'],
                ['WDK compatible', 'Native (same wallet)', 'Separate module needed'],
              ] as const).map(([label, eip7702, erc4337]) => (
                <tr key={label} className="hover:bg-slate-50">
                  <td className="px-5 py-3.5 font-bold text-slate-700 text-sm">{label}</td>
                  <td className="px-5 py-3.5 text-orange-800 font-mono text-sm bg-orange-50 font-semibold">{eip7702}</td>
                  <td className="px-5 py-3.5 text-slate-500 font-mono text-sm">{erc4337}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
