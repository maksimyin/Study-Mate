import { useState } from 'react'
import TopBar from './components/TopBar'
import StudyView from './components/StudyView'
import type { View } from './types'

export default function App() {
  const [view, setView] = useState<View>('study')

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-base text-t1 font-sans">
      <TopBar activeView={view} onViewChange={setView} />
      {view === 'study' ? (
        <StudyView />
      ) : (
        <div className="flex-1 flex items-center justify-center text-t3 text-sm">
          Progress — coming soon
        </div>
      )}
    </div>
  )
}
