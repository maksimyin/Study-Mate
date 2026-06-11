import type { WeakSpot } from '../../types'

interface Props {
  spots: WeakSpot[]
  onStartPractice: (topic: string, subtopic: string) => void
}

function severity(spot: WeakSpot): 'high' | 'amber' | 'none' | 'revisit' {
  if (spot.status === 'revisit')  return 'revisit'
  if (spot.confusionRate > 0.5)  return 'high'
  if (spot.confusionRate > 0.25) return 'amber'
  return 'none'
}

function reasonLabel(spot: WeakSpot): string {
  const pct = Math.round(spot.confusionRate * 100)
  if (spot.status === 'revisit') return 'marked understood — revisit to lock it in'
  if (spot.confusionRate > 0.5) return `asked ${spot.askCount}×, ${pct}% low confidence`
  if (spot.confusionRate > 0.25) return `asked ${spot.askCount}× repeatedly, no breakthrough`
  return `asked ${spot.askCount}× — worth reviewing`
}

export default function WeakSpotPanel({ spots, onStartPractice }: Props) {
  return (
    <div className="weak-section">
      <p className="progress-section-overline">Weak Spots</p>

      {spots.length === 0 ? (
        <div className="weak-clear">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 7.2L5 10.5 12 3" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          No weak spots detected yet
        </div>
      ) : (
        <div className="weak-list">
          {spots.map(spot => {
            const sev = severity(spot)
            return (
              <div key={spot.subtopic} className={`weak-card weak-card-${sev}`}>
                <div className="weak-card-header">
                  <span className="weak-concept">{spot.subtopic}</span>
                  {spot.dominantCognitiveLevel && (
                    <span className={`bloom-badge bloom-badge-${spot.dominantCognitiveLevel}`}>
                      {spot.dominantCognitiveLevel}
                    </span>
                  )}
                  <div className={`weak-indicator weak-indicator-${sev}`} />
                </div>
                <p className="weak-reason">{reasonLabel(spot)}</p>
                <div className="weak-card-footer">
                  <button
                    className="weak-study-btn"
                    onClick={() => onStartPractice(spot.subject, spot.subtopic)}
                  >
                    {spot.status === 'revisit' ? 'Review again' : 'Study this'}
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5h6M5.5 2.5L8 5 5.5 7.5" stroke="currentColor" strokeWidth="1.3"
                        strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
