import type { ComponentType, SVGProps } from 'react'
import { SearchIcon, FlagIcon, ChartIcon } from '@/components/icons'

interface Step {
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  body: string
}

const STEPS: Step[] = [
  { Icon: SearchIcon, title: 'Find your course', body: 'Search by name or city, then pick your tees.' },
  { Icon: FlagIcon, title: 'Score every hole', body: 'Tap in scores, fairways and putts as you play.' },
  { Icon: ChartIcon, title: 'Track your game', body: 'Watch your stats and trends round after round.' },
]

/**
 * Brief three-step "how it works" primer so a newcomer understands the flow at
 * a glance. Rendered by {@link HomePage} whenever the round library is empty.
 */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="mt-8">
      <h2 id="how-heading" className="mb-3 text-sm font-semibold text-slate-600">
        How it works
      </h2>
      <ol className="space-y-3">
        {STEPS.map(({ Icon, title, body }) => (
          <li key={title} className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fairway-100 text-fairway-700">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{title}</p>
              <p className="mt-0.5 text-sm text-slate-500">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
