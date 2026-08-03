import { MenuBar } from './components/MenuBar'
import { ControlBar } from './components/ControlBar'
import { ToolsRail } from './components/ToolsRail'
import { MediaBin } from './components/MediaBin'
import { ProgramMonitor } from './components/ProgramMonitor'
import { Timeline } from './components/Timeline'
import { Inspector } from './components/Inspector'
import { HelpModal } from './components/HelpModal'
import { BrowserGate } from './components/BrowserGate'
import { SplitHandle } from './components/SplitHandle'
import { useEditorShortcuts } from './hooks/useEditorShortcuts'
import { useAutosave } from './hooks/useAutosave'
import { useLayoutSplits } from './hooks/useLayoutSplits'

export default function App() {
  useEditorShortcuts()
  useAutosave()
  const { layout, setLeftFromClientX, setRightFromClientX, setMonitorFromClientY } =
    useLayoutSplits()

  return (
    <div className="app">
      <BrowserGate />
      <MenuBar />
      <ControlBar />
      <div className="workspace">
        <div className="left-stack" style={{ width: layout.leftPx }}>
          <ToolsRail />
          <MediaBin />
        </div>
        <SplitHandle
          orientation="vertical"
          aria-label="Resize project panel"
          onDrag={setLeftFromClientX}
        />
        <div className="center-stack">
          <div
            className="monitor-pane"
            style={{ flex: `0 0 ${layout.monitorPct}%` }}
          >
            <ProgramMonitor />
          </div>
          <SplitHandle
            orientation="horizontal"
            aria-label="Resize program preview"
            onDrag={setMonitorFromClientY}
          />
          <div className="timeline-pane">
            <Timeline />
          </div>
        </div>
        <SplitHandle
          orientation="vertical"
          aria-label="Resize inspector"
          onDrag={setRightFromClientX}
        />
        <div className="inspector-pane" style={{ width: layout.rightPx }}>
          <Inspector />
        </div>
      </div>
      <HelpModal />
    </div>
  )
}
