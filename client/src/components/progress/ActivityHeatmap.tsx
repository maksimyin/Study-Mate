import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  dailyCounts: Array<{ day: string; count: number }>
}

const GAP = 2
const MIN_CELL = 10

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th'
  const r = n % 10
  if (r === 1) return 'st'
  if (r === 2) return 'nd'
  if (r === 3) return 'rd'
  return 'th'
}

function countToColor(n: number): string {
  if (n === 0)  return '#E8E6E0'
  if (n <= 3)   return '#6EE7B7'
  if (n <= 7)   return '#34D399'
  if (n <= 12)  return '#10B981'
  return '#059669'
}

function formatLabel(dateStr: string, count: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  const month = d.toLocaleDateString('en-US', { month: 'long' })
  const day = d.getDate()
  return `${month} ${day}${ordinal(day)} · ${count} question${count !== 1 ? 's' : ''}`
}

export default function ActivityHeatmap({ dailyCounts }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ days: 60, cellSize: MIN_CELL })
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const compute = () => {
      const W = el.clientWidth
      // How many MIN_CELL-sized cells fit?
      const raw = Math.floor((W + GAP) / (MIN_CELL + GAP))
      // Round down to nearest 5 for a clean number
      const days = Math.max(30, Math.floor(raw / 5) * 5)
      // Expand cell size to exactly fill the width
      const cellSize = (W - (days - 1) * GAP) / days
      setDims({ days, cellSize })
    }

    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { days, cellSize } = dims
  const step = cellSize + GAP

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dayList: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const yyyy = d.getFullYear()
    const mm   = String(d.getMonth() + 1).padStart(2, '0')
    const dd   = String(d.getDate()).padStart(2, '0')
    dayList.push(`${yyyy}-${mm}-${dd}`)
  }

  const countMap = new Map(dailyCounts.map(d => [d.day, d.count]))

  const monthLabels: { label: string; index: number }[] = []
  let lastMonth = -1
  dayList.forEach((day, i) => {
    const m = new Date(day + 'T12:00:00').getMonth()
    if (m !== lastMonth) {
      monthLabels.push({
        label: new Date(day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }),
        index: i,
      })
      lastMonth = m
    }
  })

  const LEGEND_COLORS = ['#E8E6E0', '#6EE7B7', '#34D399', '#10B981', '#059669']

  return (
    <div className="heatmap-section">
      <p className="progress-section-overline">Study Activity — Last {days} Days</p>

      <div className="heatmap-wrap" ref={containerRef}>
        {monthLabels.map(({ label, index }) => (
          <span
            key={label + index}
            className="heatmap-month-label"
            style={{ left: index * step }}
          >
            {label}
          </span>
        ))}
        <div className="heatmap-row">
          {dayList.map((day, i) => {
            const count = countMap.get(day) ?? 0
            return (
              <div
                key={day}
                className="heatmap-cell"
                style={{
                  width: cellSize,
                  height: cellSize,
                  background: countToColor(count),
                  animationDelay: `${i * 8}ms`,
                }}
                onMouseEnter={e => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setTooltip({ x: rect.left + rect.width / 2, y: rect.top, text: formatLabel(day, count) })
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            )
          })}
        </div>
      </div>

      <div className="heatmap-legend">
        <span className="heatmap-legend-text">Less</span>
        {LEGEND_COLORS.map((c, i) => (
          <div key={i} className="heatmap-cell heatmap-legend-cell" style={{ background: c, width: cellSize, height: cellSize }} />
        ))}
        <span className="heatmap-legend-text">More</span>
      </div>

      {/* Portaled to <body>: the section's backdrop-filter makes it the
          containing block for position:fixed, which threw the tooltip off */}
      {tooltip && createPortal(
        <div className="heatmap-tooltip" style={{ left: tooltip.x, top: tooltip.y - 38 }}>
          {tooltip.text}
        </div>,
        document.body,
      )}
    </div>
  )
}
