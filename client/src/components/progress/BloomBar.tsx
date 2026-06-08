import { useState } from 'react'
import type { BloomLevel } from '../../types'

interface Props {
  distribution: Record<BloomLevel, number>
  topic: string
}

const LEVELS: BloomLevel[] = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']

const BLOOM_BG: Record<BloomLevel, string> = {
  remember:  '#252525',
  understand: '#2e2e3e',
  apply:     'rgba(110,231,183,0.28)',
  analyze:   'rgba(110,231,183,0.50)',
  evaluate:  'rgba(110,231,183,0.72)',
  create:    '#6EE7B7',
}

const BLOOM_TEXT: Record<BloomLevel, string> = {
  remember:  '#444',
  understand: '#555',
  apply:     'rgba(110,231,183,0.55)',
  analyze:   'rgba(110,231,183,0.72)',
  evaluate:  'rgba(110,231,183,0.88)',
  create:    '#6EE7B7',
}

export default function BloomBar({ distribution, topic }: Props) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)

  const total = LEVELS.reduce((s, l) => s + distribution[l], 0)

  return (
    <div className="bloom-section">
      <p className="progress-section-overline">{topic} — Study Depth</p>

      {total === 0 ? (
        <div className="bloom-prompt">No cognitive level data yet for this topic</div>
      ) : (
        <>
          <div className="bloom-track">
            {LEVELS.map(level => {
              const pct = (distribution[level] / total) * 100
              if (pct === 0) return null
              return (
                <div
                  key={level}
                  className="bloom-segment"
                  style={{ width: `${pct}%`, background: BLOOM_BG[level] }}
                  onMouseEnter={e => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setTooltip({
                      x: rect.left + rect.width / 2,
                      y: rect.top,
                      text: `${level.charAt(0).toUpperCase() + level.slice(1)} · ${distribution[level]}`,
                    })
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              )
            })}
          </div>

          <div className="bloom-legend">
            {LEVELS.map(level => (
              <div key={level} className="bloom-legend-item">
                <div className="bloom-dot" style={{ background: BLOOM_BG[level] }} />
                <span className="bloom-legend-label" style={{ color: BLOOM_TEXT[level] }}>
                  {level}
                </span>
                <span className="bloom-legend-count">{distribution[level]}</span>
              </div>
            ))}
          </div>

          {tooltip && (
            <div className="bloom-tooltip" style={{ left: tooltip.x, top: tooltip.y - 38 }}>
              {tooltip.text}
            </div>
          )}
        </>
      )}
    </div>
  )
}
