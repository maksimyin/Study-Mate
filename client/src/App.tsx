import { useState } from 'react'
import TopBar from './components/TopBar'
import StudyView from './components/StudyView'
import ProgressPage from './components/progress/ProgressPage'
import type { View } from './types'

export interface PendingStudy {
  topic: string
  subtopic: string
}

export default function App() {
  const [view, setView] = useState<View>(() =>
    localStorage.getItem('activeView') === 'progress' ? 'progress' : 'study'
  )
  const [pendingStudy, setPendingStudy] = useState<PendingStudy | null>(null)

  const changeView = (v: View) => {
    setView(v)
    localStorage.setItem('activeView', v)
  }

  const handleStartPractice = (topic: string, subtopic: string) => {
    setPendingStudy({ topic, subtopic })
    changeView('study')
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden text-t1 font-sans">
      <TopBar activeView={view} onViewChange={changeView} />
      <div key={view} className="view-fade flex flex-1 flex-col min-h-0 overflow-hidden">
        {view === 'study'
          ? <StudyView pendingStudy={pendingStudy} onPendingStudyConsumed={() => setPendingStudy(null)} />
          : <ProgressPage onStartPractice={handleStartPractice} />}
      </div>
    </div>
  )
}
