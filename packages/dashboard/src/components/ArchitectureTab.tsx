import { useState } from 'react'
import {
  Cpu, Wallet, Code2, Link, Layers, Wrench,
  ChevronDown, ChevronUp,
  CheckCircle, XCircle,
} from 'lucide-react'

type ExpandedBox = 'mcp' | 'policyEngine' | 'eip7702' | 'contract' | null

const MCP_TOOLS = [
  'clawvault_create_wallet', 'clawvault_get_balance', 'clawvault_transfer',
  'clawvault_get_policy_status', 'clawvault_get_audit_log', 'clawvault_update_policy',
  'clawvault_freeze', 'clawvault_unfreeze', 'clawvault_create_session_key',
  'clawvault_revoke_session_key', 'clawvault_register_identity',
  'clawvault_grant_permissions', 'clawvault_revoke_permissions', 'clawvault_get_permissions',
] as const

const POLICY_RULES = [
  'maxPerTx', 'dailyLimit', 'cooldown', 'blockedTokens', 'allowedTokens',
  'blockedRecipients', 'allowedRecipients', 'allowedChains',
  'anomalyDetection', 'requireApproval',
] as const

const EIP7702_METHODS = [
  'delegateToPolicy', 'initializePolicy', 'createSessionKey', 'revokeSessionKey',
  'validateOnChain', 'executeViaPolicy', 'freeze', 'unfreeze', 'revokeDelegation',
  'getTransactionReceipt', 'getActiveSessionKeyCount',
] as const

const CONTRACT_FUNCTIONS = [
  'initializePolicy', 'createSessionKey', 'revokeSessionKey',
  'validateTransaction', 'execute', 'executeBatch',
  'freeze', 'unfreeze', 'initiateRecovery', 'executeRecovery',
  'redeemDelegations', 'supportsInterface',
] as const

interface ZoneBoxProps {
  emoji: string
  title: string
  bullets: string[]
  expandKey: ExpandedBox
  expanded: ExpandedBox
  onToggle: (key: ExpandedBox) => void
  borderColor: string
  titleColor: string
}

function ZoneBox({ emoji, title, bullets, expandKey, expanded, onToggle, borderColor, titleColor }: ZoneBoxProps) {
  const isOpen = expanded === expandKey
  const canExpand = expandKey !== null

  return (
    <div className="flex flex-col min-w-0 flex-1">
      <button
        type="button"
        onClick={() => canExpand && onToggle(isOpen ? null : expandKey)}
        className={`bg-white rounded-xl border-2 ${borderColor} p-4 text-left transition-all w-full h-full ${canExpand ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="text-lg leading-none">{emoji}</span>
            <h3 className={`font-bold ${titleColor} text-sm leading-tight`}>{title}</h3>
          </div>
          {canExpand && (
            isOpen
              ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          )}
        </div>
        <ul className="space-y-1">
          {bullets.map(b => (
            <li key={b} className="text-[11px] text-slate-500 leading-snug">
              {b}
            </li>
          ))}
        </ul>
      </button>
    </div>
  )
}

function ExpandedPanel({ title, items, color }: { title: string; items: readonly string[]; color: string }) {
  return (
    <div className={`${color} rounded-lg border border-slate-200 p-4 mt-2`}>
      <p className="text-xs font-bold text-slate-700 mb-2">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {items.map(item => (
          <span key={item} className="text-[11px] font-mono bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 shadow-sm">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function BlueHorizontalArrow() {
  return (
    <div className="hidden lg:flex items-center px-1 shrink-0">
      <div className="w-8 h-[3px] bg-blue-400" />
      <div
        className="w-0 h-0 border-t-[6px] border-b-[6px] border-l-[8px] border-t-transparent border-b-transparent border-l-blue-400"
      />
    </div>
  )
}

function VerticalConnector({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center py-4">
      <div className="w-[3px] h-10 bg-orange-400 rounded-full" />
      <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[10px] border-l-transparent border-r-transparent border-t-orange-500" />
      <span className="text-xs font-mono text-orange-600 font-semibold mt-1">{label}</span>
    </div>
  )
}

function StandardsPills({ standards }: { standards: { label: string; bg: string; text: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-dashed border-slate-200">
      {standards.map(s => (
        <span key={s.label} className={`text-[10px] font-mono ${s.bg} ${s.text} px-2 py-0.5 rounded font-semibold`}>
          {s.label}
        </span>
      ))}
    </div>
  )
}

function ArchitectureDiagram() {
  const [expanded, setExpanded] = useState<ExpandedBox>(null)

  return (
    <div className="space-y-0">

      {/* ═══ ZONE 1: AGENT LAYER ═══ */}
      <div className="relative border-2 border-dashed border-blue-300 rounded-2xl p-6 pt-8">
        <span className="absolute -top-3 left-6 bg-white px-3 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-blue-600">
          Agent Layer
        </span>
        <div className="flex flex-col lg:flex-row items-stretch gap-3">
          <ZoneBox
            emoji="🤖"
            title="AI Agent (OpenClaw)"
            bullets={['LLM-powered autonomous agent', 'Calls MCP tools to transact', 'Scoped by PolicyEngine rules']}
            expandKey={null} expanded={expanded} onToggle={setExpanded}
            borderColor="border-blue-200" titleColor="text-blue-900"
          />
          <BlueHorizontalArrow />
          <div className="flex flex-col min-w-0 flex-[1.6]">
            <ZoneBox
              emoji="🔌"
              title="MCP Server (14 tools)"
              bullets={['Model Context Protocol interface', 'ERC-7715 permission grants', 'Transaction simulation + execution']}
              expandKey="mcp" expanded={expanded} onToggle={setExpanded}
              borderColor="border-blue-200" titleColor="text-blue-900"
            />
            {expanded === 'mcp' && <ExpandedPanel title="All 14 MCP Tools" items={MCP_TOOLS} color="bg-blue-50" />}
          </div>
          <BlueHorizontalArrow />
          <ZoneBox
            emoji="💼"
            title="PolicyAccount (WDK Wallet)"
            bullets={['Per-agent wallet instance', 'BIP-39 / BIP-44 derived', 'Holds funds + signs transactions']}
            expandKey={null} expanded={expanded} onToggle={setExpanded}
            borderColor="border-blue-200" titleColor="text-blue-900"
          />
        </div>
      </div>

      <VerticalConnector label="evaluates" />

      {/* ═══ ZONE 2: POLICY LAYER ═══ */}
      <div className="relative border-2 border-dashed border-amber-300 rounded-2xl p-6 pt-8">
        <span className="absolute -top-3 left-6 bg-white px-3 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-amber-600">
          Policy Layer (Off-Chain, &lt;1ms)
        </span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex flex-col">
            <ZoneBox
              emoji="🛡️"
              title="PolicyEngine"
              bullets={['10 configurable rules', 'Risk scoring 0-100', 'Anomaly detection']}
              expandKey="policyEngine" expanded={expanded} onToggle={setExpanded}
              borderColor="border-amber-200" titleColor="text-amber-900"
            />
            {expanded === 'policyEngine' && <ExpandedPanel title="All 10 Policy Rules" items={POLICY_RULES} color="bg-amber-50" />}
          </div>
          <div className="flex flex-col">
            <ZoneBox
              emoji="📋"
              title="AuditLog"
              bullets={['Every tx logged', 'Approve/deny + reason + risk', 'Filterable, exportable']}
              expandKey={null} expanded={expanded} onToggle={setExpanded}
              borderColor="border-amber-200" titleColor="text-amber-900"
            />
          </div>
          <div className="flex flex-col">
            <ZoneBox
              emoji="🔑"
              title="EIP7702Manager"
              bullets={['viem signAuthorization', 'Session key lifecycle', 'Freeze / unfreeze']}
              expandKey="eip7702" expanded={expanded} onToggle={setExpanded}
              borderColor="border-amber-200" titleColor="text-amber-900"
            />
            {expanded === 'eip7702' && <ExpandedPanel title="Key Methods" items={EIP7702_METHODS} color="bg-amber-50" />}
          </div>
        </div>
        <StandardsPills standards={[
          { label: 'ERC-7710', bg: 'bg-amber-100', text: 'text-amber-700' },
          { label: 'ERC-7715', bg: 'bg-amber-100', text: 'text-amber-700' },
          { label: 'ERC-8004', bg: 'bg-amber-100', text: 'text-amber-700' },
        ]} />
      </div>

      <VerticalConnector label="type 0x04" />

      {/* ═══ ZONE 3: EXECUTION LAYER ═══ */}
      <div className="relative border-2 border-dashed border-emerald-300 rounded-2xl p-6 pt-8">
        <span className="absolute -top-3 left-6 bg-white px-3 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-600">
          Execution Layer (On-Chain, Sepolia)
        </span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col">
            <ZoneBox
              emoji="🏦"
              title="Tether WDK"
              bullets={['Self-custodial wallet', 'BIP-39 + BIP-44', '20+ chain support']}
              expandKey={null} expanded={expanded} onToggle={setExpanded}
              borderColor="border-emerald-200" titleColor="text-emerald-900"
            />
          </div>
          <div className="flex flex-col">
            <ZoneBox
              emoji="📜"
              title="PolicyDelegate.sol"
              bullets={['EIP-7702 delegate contract', 'Session keys + spending limits', 'Freeze + recovery + allowlists']}
              expandKey="contract" expanded={expanded} onToggle={setExpanded}
              borderColor="border-emerald-200" titleColor="text-emerald-900"
            />
            {expanded === 'contract' && <ExpandedPanel title="Contract Functions (46 tests passing)" items={CONTRACT_FUNCTIONS} color="bg-emerald-50" />}
          </div>
        </div>
        <StandardsPills standards={[
          { label: 'ERC-7821', bg: 'bg-emerald-100', text: 'text-emerald-700' },
          { label: 'ERC-7710', bg: 'bg-emerald-100', text: 'text-emerald-700' },
          { label: 'ERC-165', bg: 'bg-emerald-100', text: 'text-emerald-700' },
        ]} />
      </div>

      <VerticalConnector label="settles" />

      {/* ═══ ZONE 4: BLOCKCHAIN ═══ */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl border-2 border-slate-600 shadow-xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xl leading-none">&#x26d3;&#xfe0f;</span>
          <h3 className="font-bold text-white text-lg">Ethereum Sepolia</h3>
          <span className="text-[10px] font-mono text-slate-400 ml-auto">Prague EVM &middot; EIP-7702</span>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 mt-3">
          <a href="https://sepolia.etherscan.io/address/0xB40881D3066134514e9ec4CD0B848C49ba7Fe8d0"
            target="_blank" rel="noreferrer"
            className="text-xs font-mono text-orange-400 hover:text-orange-300 underline transition-colors">
            PolicyDelegate: 0xB408...e8d0 &#x2197;
          </a>
          <a href="https://sepolia.etherscan.io/token/0x7169D38820dfd117C3FA1f22a697dBA58d90BA06"
            target="_blank" rel="noreferrer"
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 underline transition-colors">
            USDT: 0x7169...BA06 &#x2197;
          </a>
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
    description: 'Prague EVM target for 7702 opcodes. PolicyDelegate contract with 46 tests passing. OpenZeppelin ReentrancyGuard.' },
  { icon: Cpu, title: 'MCP Protocol', color: 'bg-purple-600',
    description: 'Model Context Protocol for AI agent tool calling. 14 callable tools. Any MCP-compatible agent can use ClawVault.' },
  { icon: Layers, title: 'React + Vite + Tailwind', color: 'bg-blue-600',
    description: 'Interactive simulator + live dashboard. 5-tab SPA with scenario-driven demos. Recharts for data visualization.' },
] as const

type StandardStatus = 'implemented' | 'planned' | 'future'

const STATUS_STYLES: Record<StandardStatus, { border: string; badge: string; badgeText: string; label: string }> = {
  implemented: { border: 'border-emerald-300', badge: 'bg-emerald-100 text-emerald-700', badgeText: 'Implemented', label: 'bg-emerald-600' },
  planned: { border: 'border-amber-300', badge: 'bg-amber-100 text-amber-700', badgeText: 'In Progress', label: 'bg-amber-600' },
  future: { border: 'border-slate-300', badge: 'bg-slate-100 text-slate-600', badgeText: 'Roadmap', label: 'bg-slate-500' },
}

const STANDARDS_STACK: { standard: string; title: string; description: string; status: StandardStatus }[] = [
  { standard: 'ERC-7715', title: 'Permission Granting (JSON-RPC)', description: 'User/dApp requests scoped wallet permissions via standardized JSON-RPC', status: 'implemented' },
  { standard: 'ERC-7710', title: 'Delegation Interface', description: 'Scoped, policy-constrained delegation enforcement on-chain', status: 'implemented' },
  { standard: 'ERC-7821', title: 'Batch Executor Interface', description: 'Atomic multi-call execution for EIP-7702 delegated EOAs', status: 'implemented' },
  { standard: 'EIP-7702', title: 'EOA Code Delegation', description: 'Upgrade any EOA to a smart account — same address, reversible', status: 'implemented' },
  { standard: 'ERC-8004', title: 'Agent Identity & Reputation', description: 'On-chain agent identity NFTs and reputation-gated trust', status: 'implemented' },
  { standard: 'ERC-7579', title: 'Modular Account Hooks', description: 'Portable policy modules for modular smart accounts', status: 'future' },
]

const COMPETITOR_FEATURES: { feature: string; clawvault: boolean; l1ad: boolean | null; policyLayer: boolean | null; litProtocol: boolean; crossmint: boolean }[] = [
  { feature: 'EIP-7702 delegation', clawvault: true, l1ad: false, policyLayer: false, litProtocol: false, crossmint: false },
  { feature: 'On-chain enforcement', clawvault: true, l1ad: false, policyLayer: false, litProtocol: false, crossmint: false },
  { feature: 'Off-chain policy engine', clawvault: true, l1ad: true, policyLayer: true, litProtocol: false, crossmint: false },
  { feature: '10 policy rules', clawvault: true, l1ad: true, policyLayer: null, litProtocol: false, crossmint: false },
  { feature: 'Risk scoring 0-100', clawvault: true, l1ad: false, policyLayer: false, litProtocol: false, crossmint: false },
  { feature: 'Anomaly detection', clawvault: true, l1ad: false, policyLayer: false, litProtocol: false, crossmint: false },
  { feature: 'ERC-8004 identity', clawvault: true, l1ad: false, policyLayer: false, litProtocol: false, crossmint: false },
  { feature: 'MCP server (14 tools)', clawvault: true, l1ad: false, policyLayer: false, litProtocol: false, crossmint: false },
  { feature: 'Real testnet transactions', clawvault: true, l1ad: false, policyLayer: null, litProtocol: false, crossmint: false },
  { feature: 'Session keys', clawvault: true, l1ad: false, policyLayer: null, litProtocol: false, crossmint: false },
  { feature: 'Emergency freeze', clawvault: true, l1ad: true, policyLayer: false, litProtocol: false, crossmint: false },
  { feature: 'Self-custodial (WDK)', clawvault: true, l1ad: true, policyLayer: false, litProtocol: true, crossmint: false },
  { feature: 'ERC-7710 delegation', clawvault: true, l1ad: false, policyLayer: false, litProtocol: false, crossmint: false },
  { feature: 'ERC-7715 permissions', clawvault: true, l1ad: false, policyLayer: false, litProtocol: false, crossmint: false },
]

function CompetitorCell({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-slate-400 text-sm">?</span>
  if (value) return <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
  return <XCircle className="w-4 h-4 text-red-400 mx-auto" />
}

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

      {/* Section E: Standards Stack */}
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Standards Stack</h2>
        <p className="text-sm text-slate-500 mb-4">The full EIP/ERC standards ClawVault implements — from permission request to on-chain execution.</p>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="space-y-0">
            {STANDARDS_STACK.map((item, i) => {
              const style = STATUS_STYLES[item.status]
              const isFirst = i === 0
              const isLast = i === STANDARDS_STACK.length - 1
              return (
                <div
                  key={item.standard}
                  className={`border-2 ${style.border} px-5 py-4 flex items-center justify-between gap-4 ${
                    isFirst ? 'rounded-t-xl' : ''
                  } ${isLast ? 'rounded-b-xl' : ''} ${!isFirst ? '-mt-[2px]' : ''}`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className={`${style.label} text-white text-xs font-bold px-2.5 py-1 rounded-md whitespace-nowrap`}>
                      {item.standard}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 text-sm">{item.title}</p>
                      <p className="text-xs text-slate-500 truncate">{item.description}</p>
                    </div>
                  </div>
                  <span className={`${style.badge} text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap`}>
                    {style.badgeText}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Section F: Competitor Comparison */}
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Competitor Comparison</h2>
        <p className="text-sm text-slate-500 mb-4">Feature-by-feature comparison against other agent wallet and policy platforms.</p>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="bg-slate-100 px-4 py-3.5 text-left font-bold text-slate-600 text-xs uppercase tracking-wider">Feature</th>
                <th className="bg-orange-50 px-4 py-3.5 text-center font-bold text-orange-800 text-xs uppercase tracking-wider border-x border-orange-200">ClawVault</th>
                <th className="bg-slate-100 px-4 py-3.5 text-center font-bold text-slate-600 text-xs uppercase tracking-wider">L1AD</th>
                <th className="bg-slate-100 px-4 py-3.5 text-center font-bold text-slate-600 text-xs uppercase tracking-wider">PolicyLayer</th>
                <th className="bg-slate-100 px-4 py-3.5 text-center font-bold text-slate-600 text-xs uppercase tracking-wider">LIT Protocol</th>
                <th className="bg-slate-100 px-4 py-3.5 text-center font-bold text-slate-600 text-xs uppercase tracking-wider">Crossmint</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {COMPETITOR_FEATURES.map((row, i) => (
                <tr key={row.feature} className={i % 2 === 1 ? 'bg-slate-50/50' : ''}>
                  <td className="px-4 py-3 font-medium text-slate-700 text-sm">{row.feature}</td>
                  <td className="px-4 py-3 text-center bg-orange-50/60 border-x border-orange-100">
                    <CompetitorCell value={row.clawvault} />
                  </td>
                  <td className="px-4 py-3 text-center"><CompetitorCell value={row.l1ad} /></td>
                  <td className="px-4 py-3 text-center"><CompetitorCell value={row.policyLayer} /></td>
                  <td className="px-4 py-3 text-center"><CompetitorCell value={row.litProtocol} /></td>
                  <td className="px-4 py-3 text-center"><CompetitorCell value={row.crossmint} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
