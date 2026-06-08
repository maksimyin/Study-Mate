import { useState } from 'react'
import TopBar from './components/TopBar'
import StudyView from './components/StudyView'
import ProgressPage from './components/progress/ProgressPage'
import type { View } from './types'

export default function App() {
  const [view, setView] = useState<View>('study')

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-base text-t1 font-sans">
      <TopBar activeView={view} onViewChange={setView} />
      {view === 'study' ? <StudyView /> : <ProgressPage />}
    </div>
  )
}
