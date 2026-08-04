import { useEffect, useRef, type CSSProperties } from 'react'
import { useDocStore } from '../store/documentStore'
import { PlaybackEngine } from '../media/playback'

export function ProgramMonitor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<PlaybackEngine | null>(null)
  const paintRafRef = useRef(0)
  const playheadTicks = useDocStore((s) => s.playheadTicks)
  const playing = useDocStore((s) => s.playing)
  const doc = useDocStore((s) => s.doc)
  const { width, height } = doc.sequence

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new PlaybackEngine(
      () => useDocStore.getState().doc,
      () => useDocStore.getState().playheadTicks,
      (t) => useDocStore.getState().setPlayhead(t),
      () => useDocStore.getState().playing,
      (p) => useDocStore.getState().setPlaying(p),
      canvas,
    )
    engineRef.current = engine
    engine.start()
    void engine.paint()
    return () => {
      cancelAnimationFrame(paintRafRef.current)
      engine.destroy()
    }
  }, [])

  useEffect(() => {
    // During playback the engine already paints every tick it advances —
    // repainting here too would double every composeFrame/seek per frame.
    // This path is for everything else that moves the playhead (scrub,
    // razor, programmatic seeks), where a fast scrub can fire several
    // playheadTicks changes within one animation frame — batch those into
    // a single paint of the latest position instead of one per pointermove.
    if (playing) return
    cancelAnimationFrame(paintRafRef.current)
    paintRafRef.current = requestAnimationFrame(() => {
      void engineRef.current?.paint(useDocStore.getState().playheadTicks)
    })
    return () => cancelAnimationFrame(paintRafRef.current)
  }, [playheadTicks, doc, playing])

  useEffect(() => {
    if (!playing) engineRef.current?.stopAudio()
  }, [playing])

  return (
    <section className="program-monitor">
      <header className="panel-header">
        <h2>Program</h2>
        <span className="muted">
          {width}×{height}
        </span>
      </header>
      <div
        className="monitor-stage"
        style={
          {
            '--seq-w': width,
            '--seq-h': height,
          } as CSSProperties
        }
      >
        <div className="monitor-frame">
          <canvas ref={canvasRef} className="monitor-canvas" />
        </div>
      </div>
    </section>
  )
}
