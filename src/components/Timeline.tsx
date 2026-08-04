import { useEffect, useMemo, useRef } from 'react'
import { useDocStore } from '../store/documentStore'
import { clipDurationTicks, clipEndTicks } from '../types'
import { computeContentEnd, normalizeDocument } from '../store/document'
import { formatTimecode } from '../store/documentStore'

const TRACK_H = 52
const LABEL_W = 72
/** Fraction across the visible timeline where playback starts pulling the view forward. */
const FOLLOW_FRACTION = 0.82
/** Fraction from the left edge to land on when the playhead reappears from fully out of view. */
const RECENTER_FRACTION = 0.15

type DragState = {
  clipId: string
  mode: 'move' | 'in' | 'out'
  originX: number
  originStart: number
  originIn: number
  originOut: number
}

export function Timeline() {
  const doc = useDocStore((s) => s.doc)
  const playhead = useDocStore((s) => s.playheadTicks)
  const playing = useDocStore((s) => s.playing)
  const zoom = useDocStore((s) => s.timelineZoom)
  const selected = useDocStore((s) => s.selectedClipIds)
  const tool = useDocStore((s) => s.tool)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const panRef = useRef<{ x: number; scroll: number } | null>(null)
  const scrubRef = useRef(false)

  const widthPx = Math.max(800, doc.sequence.durationTicks * zoom + 200)

  const rulerMarks = useMemo(() => {
    const marks: { tick: number; major: boolean }[] = []
    const step = doc.sequence.frameRate
    for (let t = 0; t <= doc.sequence.durationTicks; t += step) {
      marks.push({ tick: t, major: t % (step * 5) === 0 })
    }
    return marks
  }, [doc.sequence.durationTicks, doc.sequence.frameRate])

  const tickFromClientX = (clientX: number): number => {
    const el = scrollRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left + el.scrollLeft - LABEL_W
    return Math.max(0, Math.round(x / zoom))
  }

  // Ctrl+wheel (and trackpad pinch, which browsers report as ctrl+wheel) zooms
  // the timeline anchored to the cursor. Registered as a real non-passive
  // listener because React's onWheel can't reliably preventDefault the
  // browser's native page-zoom gesture.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cursorScreenX = e.clientX - rect.left
      const currentZoom = useDocStore.getState().timelineZoom
      const cursorTick = (cursorScreenX + el.scrollLeft - LABEL_W) / currentZoom
      const factor = Math.exp(-e.deltaY * 0.0015)
      const nextZoom = Math.max(2, Math.min(64, currentZoom * factor))
      useDocStore.getState().setTimelineZoom(nextZoom)
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, cursorTick * nextZoom + LABEL_W - cursorScreenX)
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Follow the playhead during playback: once it crosses FOLLOW_FRACTION across
  // the visible timeline, scroll forward to keep it there instead of letting it
  // run off the edge. If it's ever fully out of view (e.g. a seek mid-playback),
  // snap back so it's comfortably visible rather than continuing to chase.
  useEffect(() => {
    if (!playing) return
    if (panRef.current || dragRef.current || scrubRef.current) return
    const el = scrollRef.current
    if (!el) return
    const playheadPx = LABEL_W + playhead * zoom
    const viewStart = el.scrollLeft
    const viewEnd = viewStart + el.clientWidth
    const followAt = viewStart + el.clientWidth * FOLLOW_FRACTION
    if (playheadPx > followAt) {
      el.scrollLeft = Math.max(0, playheadPx - el.clientWidth * FOLLOW_FRACTION)
    } else if (playheadPx < viewStart || playheadPx > viewEnd) {
      el.scrollLeft = Math.max(0, playheadPx - el.clientWidth * RECENTER_FRACTION)
    }
  }, [playhead, playing, zoom])

  const applyDrag = (d: DragState, clientX: number) => {
    const dxTicks = Math.round((clientX - d.originX) / zoom)
    useDocStore.setState((st) => {
      const tracks = st.doc.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== d.clipId) return c
          if (d.mode === 'move') {
            return { ...c, timelineStart: Math.max(0, d.originStart + dxTicks) }
          }
          if (d.mode === 'in') {
            const newStart = Math.max(0, d.originStart + dxTicks)
            const delta = newStart - d.originStart
            const newIn = d.originIn + delta
            if (newIn >= d.originOut - 1) return c
            return { ...c, timelineStart: newStart, in: newIn, out: d.originOut }
          }
          const newEnd = Math.max(d.originStart + 1, clipEndTicks({
            id: c.id,
            assetId: c.assetId,
            trackId: c.trackId,
            timelineStart: d.originStart,
            in: d.originIn,
            out: d.originOut,
          }) + dxTicks)
          const newOut = d.originIn + (newEnd - d.originStart)
          const asset = st.doc.assets.find((a) => a.id === c.assetId)
          const maxOut = asset?.durationTicks ?? newOut
          if (newOut <= d.originIn + 1) return c
          return {
            ...c,
            timelineStart: d.originStart,
            in: d.originIn,
            out: Math.min(newOut, maxOut),
          }
        }),
      }))
      const next = normalizeDocument({ ...st.doc, tracks })
      next.sequence.durationTicks = Math.max(
        next.sequence.durationTicks,
        computeContentEnd(next) + next.sequence.frameRate * 2,
      )
      return { doc: next }
    })
  }

  return (
    <section className="timeline panel">
      <header className="panel-header">
        <h2>Timeline</h2>
        <span className="muted">Drop media from Project · drag clips · razor with C</span>
      </header>
      <div
        className={`timeline-scroll tool-${tool}`}
        ref={scrollRef}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('text/rough-cut-asset')) e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          const assetId = e.dataTransfer.getData('text/rough-cut-asset')
          if (!assetId) return
          useDocStore.getState().placeAsset(assetId, tickFromClientX(e.clientX))
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('.clip, .playhead-grip')) return
          if (tool === 'hand') {
            const el = scrollRef.current
            if (!el) return
            panRef.current = { x: e.clientX, scroll: el.scrollLeft }
            el.setPointerCapture(e.pointerId)
            return
          }
          const tick = tickFromClientX(e.clientX)
          useDocStore.getState().setPlayhead(tick)
          if (tool === 'razor') useDocStore.getState().razorAtPlayhead()
          scrubRef.current = true
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const pan = panRef.current
          const el = scrollRef.current
          if (pan && el && tool === 'hand') {
            el.scrollLeft = pan.scroll - (e.clientX - pan.x)
            return
          }
          if (scrubRef.current) {
            useDocStore.getState().setPlayhead(tickFromClientX(e.clientX))
          }
        }}
        onPointerUp={() => {
          panRef.current = null
          scrubRef.current = false
        }}
      >
        <div className="timeline-inner" style={{ width: widthPx }}>
          <div className="timeline-ruler" style={{ paddingLeft: LABEL_W }}>
            {rulerMarks.map((m) => (
              <div
                key={m.tick}
                className={m.major ? 'ruler-mark major' : 'ruler-mark'}
                style={{ left: LABEL_W + m.tick * zoom }}
              >
                {m.major ? (
                  <span>{formatTimecode(m.tick, doc.sequence.frameRate)}</span>
                ) : null}
              </div>
            ))}
          </div>

          {doc.tracks.map((track) => (
            <div key={track.id} className={`track track-${track.type}`} style={{ height: TRACK_H }}>
              <div className="track-label" style={{ width: LABEL_W }}>
                {track.name}
              </div>
              <div className="track-lane">
                {track.clips.map((clip) => {
                  const asset = doc.assets.find((a) => a.id === clip.assetId)
                  const w = Math.max(4, clipDurationTicks(clip) * zoom)
                  const left = clip.timelineStart * zoom
                  const isSel = selected.includes(clip.id)
                  return (
                    <div
                      key={clip.id}
                      className={isSel ? 'clip is-selected' : 'clip'}
                      style={{ left, width: w }}
                      title={asset?.name ?? clip.id}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        const s = useDocStore.getState()
                        s.selectClips([clip.id], e.shiftKey)
                        if (tool === 'razor') {
                          s.setPlayhead(tickFromClientX(e.clientX))
                          s.razorAtPlayhead()
                          return
                        }
                        if (tool !== 'select') return
                        const edge = (e.target as HTMLElement).dataset.edge as
                          | 'in'
                          | 'out'
                          | undefined
                        s.pushHistory()
                        dragRef.current = {
                          clipId: clip.id,
                          mode: edge ?? 'move',
                          originX: e.clientX,
                          originStart: clip.timelineStart,
                          originIn: clip.in,
                          originOut: clip.out,
                        }
                        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                      }}
                      onPointerMove={(e) => {
                        const d = dragRef.current
                        if (!d || d.clipId !== clip.id) return
                        applyDrag(d, e.clientX)
                      }}
                      onPointerUp={() => {
                        dragRef.current = null
                      }}
                    >
                      <span className="clip-edge left" data-edge="in" />
                      <span className="clip-label">{asset?.name ?? 'Clip'}</span>
                      <span className="clip-edge right" data-edge="out" />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <div
            className="playhead"
            style={{ left: LABEL_W + playhead * zoom }}
            aria-hidden
          />
          <div
            className="playhead-grip"
            style={{ left: LABEL_W + playhead * zoom }}
            title="Drag to scrub"
            onPointerDown={(e) => {
              e.stopPropagation()
              scrubRef.current = true
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (!scrubRef.current) return
              useDocStore.getState().setPlayhead(tickFromClientX(e.clientX))
            }}
            onPointerUp={(e) => {
              scrubRef.current = false
              ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
            }}
          />
        </div>
      </div>
    </section>
  )
}
