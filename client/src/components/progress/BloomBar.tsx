import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { BloomLevel } from '../../types'

interface Props {
  distribution: Record<BloomLevel, number>
  topic: string
}

const LEVELS: BloomLevel[] = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']

const BLOOM_BG: Record<BloomLevel, string> = {
  remember:  '#E8E6E0',
  understand: '#D8D5CD',
  apply:     '#6EE7B7',
  analyze:   '#34D399',
  evaluate:  '#10B981',
  create:    '#059669',
}

const BLOOM_TEXT: Record<BloomLevel, string> = {
  remember:  '#9B9892',
  understand: '#6B6B6B',
  apply:     'rgba(5,150,105,0.6)',
  analyze:   'rgba(5,150,105,0.75)',
  evaluate:  'rgba(5,150,105,0.9)',
  create:    '#047857',
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

          {/* Portaled to <body>: backdrop-filter on the section breaks
              position:fixed coordinates for descendants */}
          {tooltip && createPortal(
            <div className="bloom-tooltip" style={{ left: tooltip.x, top: tooltip.y - 38 }}>
              {tooltip.text}
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  )
}
