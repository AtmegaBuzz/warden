const TABS = ['Simulator', 'Live Dashboard', 'Architecture', 'EIP-7702', 'Audit Log'] as const

export type Tab = (typeof TABS)[number]

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

export function TabNav({ active, onChange }: Props) {
  return (
    <nav className="bg-white border-b-2 border-slate-200">
      <div className="flex">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`flex-1 py-3.5 text-sm font-semibold border-b-[3px] transition-colors outline-none ${
              active === tab
                ? 'text-orange-600 border-orange-500 bg-orange-50/50'
                : 'text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
    </nav>
  )
}
