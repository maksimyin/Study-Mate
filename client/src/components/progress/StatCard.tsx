import { useEffect, useState } from 'react'

interface Props {
  icon: 'asks' | 'weak' | 'level'
  value: number | string
  label: string
}

// Count up from 0 on mount — fast and subtle (150ms, ease-out).
// Skipped entirely when the user prefers reduced motion.
function useCountUp(target: number, duration = 150): number {
  const [val, setVal] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVal(target)
      return
    }
    let raf: number
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3) // ease-out cubic
      setVal(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return val
}

function AsksIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="11" rx="2" stroke="#059669" strokeWidth="1.3"/>
      <path d="M5 1v3M11 1v3" stroke="#059669" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M2 7h12" stroke="#059669" strokeWidth="1.3"/>
      <path d="M5 10.5h2M9 10.5h2" stroke="#059669" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

function WeakIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L14 13H2L8 2Z" stroke="#059669" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M8 6.5v3" stroke="#059669" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="8" cy="11" r="0.75" fill="#059669"/>
    </svg>
  )
}

function LevelIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M2 11.5L5.5 7.5 8.5 9.5 12 5" stroke="#059669" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="4" r="1.5" fill="#059669"/>
    </svg>
  )
}

function CountUpValue({ target }: { target: number }) {
  const val = useCountUp(target)
  return <>{val}</>
}

export default function StatCard({ icon, value, label }: Props) {
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <div className="stat-card-icon-wrap">
          {icon === 'asks'  && <AsksIcon />}
          {icon === 'weak'  && <WeakIcon />}
          {icon === 'level' && <LevelIcon />}
        </div>
      </div>
      <div className="stat-card-value">
        {typeof value === 'number' ? <CountUpValue target={value} /> : value}
      </div>
      <div className="stat-card-label">{label}</div>
    </div>
  )
}
