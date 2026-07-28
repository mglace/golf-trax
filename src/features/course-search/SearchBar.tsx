import { SearchIcon, XIcon, SpinnerIcon } from '@/components/icons'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  loading?: boolean
  placeholder?: string
}

export function SearchBar({ value, onChange, loading, placeholder }: SearchBarProps) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
        <SearchIcon className="h-5 w-5" aria-hidden />
      </span>

      <input
        type="search"
        inputMode="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Search courses by name or city'}
        aria-label="Search courses"
        className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-10 text-base shadow-sm outline-none placeholder:text-slate-500 focus:border-fairway-500 focus:ring-2 focus:ring-fairway-500/30"
      />

      <span className="absolute inset-y-0 right-2 flex items-center">
        {loading ? (
          <SpinnerIcon className="h-5 w-5 text-slate-500" aria-label="Searching" />
        ) : value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-600"
          >
            <XIcon className="h-5 w-5" aria-hidden />
          </button>
        ) : null}
      </span>
    </div>
  )
}
