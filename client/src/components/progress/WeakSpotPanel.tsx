import type { WeakSpot } from '../../types'

interface Props {
  spots: WeakSpot[]
}

function severity(confusionRate: number): 'high' | 'amber' | 'none' {
  if (confusionRate > 0.5)  return 'high'
  if (confusionRate > 0.25) return 'amber'
  return 'none'
}

function reasonLabel(spot: WeakSpot): string {
  const pct = Math.round(spot.confusionRate * 100)
  if (spot.confusionRate > 0.5) return `asked ${spot.askCount}×, ${pct}% low confidence`
  if (spot.confusionRate > 0.25) return `asked ${spot.askCount}× repeatedly, no breakthrough`
  return `asked ${spot.askCount}× — worth reviewing`
}

export default function WeakSpotPanel({ spots }: Props) {
  return (
    <div className="weak-section">
      <p className="progress-section-overline">Weak Spots</p>

      {spots.length === 0 ? (
        <div className="weak-clear">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 7.2L5 10.5 12 3" stroke="#6EE7B7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          No weak spots detected yet
        </div>
      ) : (
        <div className="weak-list">
          {spots.map(spot => {
            const sev = severity(spot.confusionRate)
            return (
              <div key={spot.subtopic} className={`weak-card weak-card-${sev}`}>
                <div className="weak-card-header">
                  <span className="weak-concept">{spot.subtopic}</span>
                  <div className={`weak-indicator weak-indicator-${sev}`} />
                </div>
                <p className="weak-reason">{reasonLabel(spot)}</p>
                {spot.dominantCognitiveLevel && (
                  <span className={`bloom-badge bloom-badge-${spot.dominantCognitiveLevel}`}>
                    {spot.dominantCognitiveLevel}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
