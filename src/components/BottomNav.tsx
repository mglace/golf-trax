import { NavLink } from 'react-router-dom'
import { HomeIcon, ListIcon, ChartIcon } from './icons'
import type { ComponentType, SVGProps } from 'react'

interface Tab {
  to: string
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  /** `end` restricts active matching to the exact path (for the index route). */
  end?: boolean
}

const tabs: Tab[] = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/rounds', label: 'Rounds', Icon: ListIcon },
  { to: '/stats', label: 'Stats', Icon: ChartIcon },
]

export function BottomNav() {
  return (
    <nav
      className="pb-safe z-20 shrink-0 border-t border-slate-200 bg-white/95 backdrop-blur"
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {tabs.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  'flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors',
                  isActive ? 'text-fairway-700' : 'text-slate-500 hover:text-slate-700',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-6 w-6" aria-hidden strokeWidth={isActive ? 2.4 : 2} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
