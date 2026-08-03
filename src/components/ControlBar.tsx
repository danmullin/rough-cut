import { formatTimecode, useDocStore } from '../store/documentStore'

export function ControlBar() {
  const playing = useDocStore((s) => s.playing)
  const playheadTicks = useDocStore((s) => s.playheadTicks)
  const fps = useDocStore((s) => s.doc.sequence.frameRate)
  const duration = useDocStore((s) => s.doc.sequence.durationTicks)
  const zoom = useDocStore((s) => s.timelineZoom)
  const tool = useDocStore((s) => s.tool)

  return (
    <div className="control-bar">
      <div className="transport">
        <button
          type="button"
          title="Go to start"
          onClick={() => useDocStore.getState().setPlayhead(0)}
        >
          ⏮
        </button>
        <button
          type="button"
          className="play-btn"
          title="Play / Pause (Space)"
          onClick={() => useDocStore.getState().setPlaying(!playing)}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          title="Go to end"
          onClick={() => useDocStore.getState().setPlayhead(duration)}
        >
          ⏭
        </button>
        <button
          type="button"
          title="Razor at playhead (Ctrl+K)"
          onClick={() => useDocStore.getState().razorAtPlayhead()}
        >
          Razor
        </button>
      </div>
      <div className="tc">
        <span className="tc-main">{formatTimecode(playheadTicks, fps)}</span>
        <span className="tc-sub">/ {formatTimecode(duration, fps)}</span>
        <span className="tc-fps">{fps} fps</span>
      </div>
      <div className="control-right">
        <span className="tool-chip">Tool: {tool}</span>
        <label className="zoom-label">
          Zoom
          <input
            type="range"
            min={2}
            max={48}
            value={zoom}
            onChange={(e) => useDocStore.getState().setTimelineZoom(Number(e.target.value))}
          />
        </label>
      </div>
    </div>
  )
}
