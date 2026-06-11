import './TopBar.css'
import type { View } from '../types'

interface Props {
  activeView: View
  onViewChange: (v: View) => void
}

function BookIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2 2.5A1.5 1.5 0 013.5 1h8a.5.5 0 01.5.5v10a.5.5 0 01-.5.5h-8A1.5 1.5 0 012 10.5v-8z"
        stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
      <path d="M5 4.5h4M5 7h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2 10.5l3-3.5 2.5 2L10 4.5l2.5 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

const TABS = [
  { id: 'study'    as View, label: 'Study',    Icon: BookIcon  },
  { id: 'progress' as View, label: 'Progress', Icon: ChartIcon },
]

export default function TopBar({ activeView, onViewChange }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-logo">
        <div className="topbar-logo-icon">
          {/* Stacked pages mark — back leaf in deep green, front leaf in mint */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="4.5" y="2" width="9" height="11" rx="2" fill="var(--accent-deep)" opacity="0.55" transform="rotate(6 9 7.5)" />
            <rect x="2.5" y="3" width="9" height="11" rx="2" fill="var(--accent)" />
            <path d="M4.8 6h4.4M4.8 8.2h3" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
          </svg>
        </div>
        <span className="topbar-logo-name">
          StudyMate
        </span>
      </div>

      <nav className="topbar-nav" data-active={activeView}>
        <span className="topbar-thumb" aria-hidden="true" />
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={`topbar-tab${activeView === id ? ' active' : ''}`}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>
    </header>
  )
}
