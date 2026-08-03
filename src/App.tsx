import { MenuBar } from './components/MenuBar'
import { ControlBar } from './components/ControlBar'
import { ToolsRail } from './components/ToolsRail'
import { MediaBin } from './components/MediaBin'
import { ProgramMonitor } from './components/ProgramMonitor'
import { Timeline } from './components/Timeline'
import { Inspector } from './components/Inspector'
import { HelpModal } from './components/HelpModal'
import { BrowserGate } from './components/BrowserGate'
import { useEditorShortcuts } from './hooks/useEditorShortcuts'
import { useAutosave } from './hooks/useAutosave'

export default function App() {
  useEditorShortcuts()
  useAutosave()

  return (
    <div className="app">
      <BrowserGate />
      <MenuBar />
      <ControlBar />
      <div className="workspace">
        <div className="left-stack">
          <ToolsRail />
          <MediaBin />
        </div>
        <div className="center-stack">
          <ProgramMonitor />
          <Timeline />
        </div>
        <Inspector />
      </div>
      <HelpModal />
    </div>
  )
}
