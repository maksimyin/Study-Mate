import { useEffect, useState } from 'react'
import './ProgressPage.css'
import StatCard from './StatCard'
import TopicActivityList from './TopicActivityList'
import WeakSpotPanel from './WeakSpotPanel'
import BloomBar from './BloomBar'
import ActivityHeatmap from './ActivityHeatmap'
import type { ProgressData } from '../../types'

interface Props {
  onStartPractice: (topic: string, subtopic: string) => void
}

export default function ProgressPage({ onStartPractice }: Props) {
  const [topics,      setTopics]      = useState<string[]>([])
  const [activeTopic, setActiveTopic] = useState<string | null>(null)
  const [data,        setData]        = useState<ProgressData | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false) // UI-only: Topics drawer

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
      {/* ── Left sidebar — hidden on load, revealed by the pill ── */}
      <aside className={`progress-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className={`sidebar-slider${activeTopic !== null ? ' drilled' : ''}`}>

          {/* Pane 1 — All Topics */}
          <div className="sidebar-pane">
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
          </div>

          {/* Pane 2 — selected topic's subtopics */}
          <div className="sidebar-pane">
            <div className="progress-sidebar-header">
              <button className="sidebar-breadcrumb" onClick={() => setActiveTopic(null)}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="crumb-chevron">
                  <path d="M6.5 1.5L3 5l3.5 3.5" stroke="currentColor" strokeWidth="1.4"
                    strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="crumb-root">All Topics</span>
                <span className="crumb-sep">›</span>
                <span className="crumb-current">{activeTopic}</span>
              </button>
            </div>
            <div className="subtopic-list">
              <p className="subtopic-overline">Subtopics</p>
              {data && data.topicActivity.length > 0 ? (
                data.topicActivity.map(item => (
                  <div key={item.subtopic} className="subtopic-item">
                    <span className="subtopic-name">{item.subtopic}</span>
                    <span className="subtopic-count">{item.askCount}×</span>
                  </div>
                ))
              ) : (
                <p className="subtopic-empty">
                  {loading ? 'Loading…' : 'No subtopics recorded yet'}
                </p>
              )}
            </div>
          </div>

        </div>
      </aside>

      {/* ── Main panel ───────────────────────────────────────── */}
      <main className="progress-main">
        <button
          className={`topics-pill${sidebarOpen ? ' open' : ''}`}
          onClick={() => setSidebarOpen(o => !o)}
          aria-expanded={sidebarOpen}
        >
          Topics
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="pill-chevron">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

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
              <rect x="8" y="14" width="36" height="30" rx="5" stroke="#D8D5CD" strokeWidth="2"/>
              <path d="M18 24h16M18 30h10" stroke="#D8D5CD" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="40" cy="16" r="7" fill="#F5F4F0" stroke="#D8D5CD" strokeWidth="2"/>
              <path d="M37 16h6M40 13v6" stroke="#9B9892" strokeWidth="1.5" strokeLinecap="round"/>
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
              <WeakSpotPanel     spots={data.weakSpots} onStartPractice={onStartPractice} />
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
