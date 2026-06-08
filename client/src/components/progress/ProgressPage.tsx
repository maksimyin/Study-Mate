import { useEffect, useState } from 'react'
import './ProgressPage.css'
import StatCard from './StatCard'
import TopicActivityList from './TopicActivityList'
import WeakSpotPanel from './WeakSpotPanel'
import BloomBar from './BloomBar'
import ActivityHeatmap from './ActivityHeatmap'
import type { ProgressData } from '../../types'

export default function ProgressPage() {
  const [topics,      setTopics]      = useState<string[]>([])
  const [activeTopic, setActiveTopic] = useState<string | null>(null)
  const [data,        setData]        = useState<ProgressData | null>(null)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    fetch('/api/topics')
      .then(r => r.json())
      .then((d: { topics: string[] }) => setTopics(d.topics))
      .catch(console.error)
  }, [])

  useEffect(() => {
    setLoading(true)
    setData(null)
    const url = activeTopic
      ? `/api/progress?topic=${encodeURIComponent(activeTopic)}`
      : '/api/progress'
    fetch(url)
      .then(r => r.json())
      .then((d: ProgressData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [activeTopic])

  const isEmpty = !loading && data !== null && data.summary.totalEvents === 0

  return (
    <div className="progress-view">
      {/* ── Left sidebar ─────────────────────────────────────── */}
      <aside className="progress-sidebar">
        <div className="progress-sidebar-header">
          <span className="progress-sidebar-title">Progress</span>
        </div>
        <nav className="progress-topic-list">
          <button
            className={`progress-topic-item${activeTopic === null ? ' active' : ''}`}
            onClick={() => setActiveTopic(null)}
          >
            All Topics
          </button>
          {topics.map(t => (
            <button
              key={t}
              className={`progress-topic-item${activeTopic === t ? ' active' : ''}`}
              onClick={() => setActiveTopic(t)}
            >
              {t}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main panel ───────────────────────────────────────── */}
      <main className="progress-main">
        {loading && (
          <div className="progress-loading">
            <span className="progress-loading-dot" />
            <span className="progress-loading-dot" />
            <span className="progress-loading-dot" />
          </div>
        )}

        {isEmpty && (
          <div className="progress-empty-state">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none" className="progress-empty-icon">
              <rect x="8" y="14" width="36" height="30" rx="5" stroke="#2a2a2a" strokeWidth="2"/>
              <path d="M18 24h16M18 30h10" stroke="#2a2a2a" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="40" cy="16" r="7" fill="#171717" stroke="#2a2a2a" strokeWidth="2"/>
              <path d="M37 16h6M40 13v6" stroke="#444" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <p className="progress-empty-label">Keep studying to unlock insights</p>
            <p className="progress-empty-hint">Your dashboard fills in as you study more.</p>
          </div>
        )}

        {!loading && data && !isEmpty && (
          <div className="progress-content">
            {/* Stat cards */}
            <div className="stat-cards-row">
              <StatCard icon="asks"  value={data.summary.totalAsksThisWeek} label="Total asks this week" />
              <StatCard icon="weak"  value={data.summary.weakSpotCount}     label="Weak spots identified" />
              <StatCard icon="level" value={data.summary.avgCognitiveLevel} label="Avg cognitive level" />
            </div>

            {/* Activity heatmap (All Topics only) */}
            {activeTopic === null && (
              <ActivityHeatmap dailyCounts={data.dailyCounts} />
            )}

            {/* Two-column grid */}
            <div className="progress-grid">
              <TopicActivityList items={data.topicActivity} />
              <WeakSpotPanel     spots={data.weakSpots} />
            </div>

            {/* Bloom's distribution bar (topic-specific only) */}
            {activeTopic !== null && (
              <BloomBar distribution={data.cognitiveDistribution} topic={activeTopic} />
            )}
          </div>
        )}
      </main>
    </div>
  )
}
