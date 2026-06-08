import { useEffect, useState } from 'react'
import type { ConceptActivity, BloomLevel } from '../../types'

interface Props {
  items: ConceptActivity[]
}

const BLOOM_SHORT: Record<BloomLevel, string> = {
  remember: 'rem', understand: 'und', apply: 'app',
  analyze: 'ana', evaluate: 'eva', create: 'cre',
}

function timeAgo(dateStr: string, now: number): string {
  const diff  = now - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (days === 0) return `${hours}h ago`
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export default function TopicActivityList({ items }: Props) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const maxCount = Math.max(...items.map(i => i.askCount), 1)

  return (
    <div className="activity-section">
      <p className="progress-section-overline">Topic Activity</p>

      {items.length === 0 ? (
        <p className="progress-empty-inline">No activity recorded yet.</p>
      ) : (
        <div className="activity-list">
          {items.map(item => {
            const barPct = (item.askCount / maxCount) * 100
            return (
              <div key={item.subtopic} className="activity-row">
                <div className="activity-row-header">
                  <span className="activity-concept">{item.subtopic}</span>
                  <span className="activity-count">{item.askCount}×</span>
                </div>
                <div className="activity-bar-track">
                  <div className="activity-bar-fill" style={{ width: `${barPct}%` }} />
                </div>
                <div className="activity-row-meta">
                  <span className="activity-recency">last asked {timeAgo(item.lastAskedAt, now)}</span>
                  {item.dominantCognitiveLevel && (
                    <span className={`bloom-badge bloom-badge-${item.dominantCognitiveLevel}`}>
                      {BLOOM_SHORT[item.dominantCognitiveLevel]}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
