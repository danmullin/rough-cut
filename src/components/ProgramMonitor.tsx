import { useEffect, useRef } from 'react'
import { useDocStore } from '../store/documentStore'
import { PlaybackEngine } from '../media/playback'

export function ProgramMonitor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<PlaybackEngine | null>(null)
  const playheadTicks = useDocStore((s) => s.playheadTicks)
  const playing = useDocStore((s) => s.playing)
  const doc = useDocStore((s) => s.doc)

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
    return () => engine.destroy()
  }, [])

  useEffect(() => {
    void engineRef.current?.paint(playheadTicks)
  }, [playheadTicks, doc])

  useEffect(() => {
    if (!playing) engineRef.current?.stopAudio()
  }, [playing])

  return (
    <section className="program-monitor">
      <header className="panel-header">
        <h2>Program</h2>
        <span className="muted">
          {doc.sequence.width}×{doc.sequence.height}
        </span>
      </header>
      <div className="monitor-stage">
        <canvas ref={canvasRef} className="monitor-canvas" />
      </div>
    </section>
  )
}
