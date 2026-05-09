import './TopBar.css'
import type { View } from '../types'

interface Props {
  activeView: View
  onViewChange: (v: View) => void
}

function BookIcon({ active }: { active: boolean }) {
  const c = active ? '#6EE7B7' : '#555555'
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2 2.5A1.5 1.5 0 013.5 1h8a.5.5 0 01.5.5v10a.5.5 0 01-.5.5h-8A1.5 1.5 0 012 10.5v-8z"
        stroke={c} strokeWidth="1.25" strokeLinejoin="round"/>
      <path d="M5 4.5h4M5 7h3" stroke={c} strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  )
}

function ChartIcon({ active }: { active: boolean }) {
  const c = active ? '#6EE7B7' : '#555555'
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2 10.5l3-3.5 2.5 2L10 4.5l2.5 3" stroke={c} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
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
        <div className="topbar-logo-icon">✦</div>
        <span className="topbar-logo-name">StudyMate</span>
      </div>

      <nav className="topbar-nav">
        {TABS.map(({ id, label, Icon }) => {
          const active = activeView === id
          return (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              className={`topbar-tab${active ? ' active' : ''}`}
            >
              <Icon active={active} />
              {label}
              {active && <span className="topbar-tab-indicator" />}
            </button>
          )
        })}
      </nav>
    </header>
  )
}
