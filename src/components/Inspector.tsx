import { useDocStore } from '../store/documentStore'
import { clipDurationTicks, ticksToSeconds } from '../types'
import { findClip } from '../store/document'
import { formatTimecode } from '../store/documentStore'

export function Inspector() {
  const doc = useDocStore((s) => s.doc)
  const selected = useDocStore((s) => s.selectedClipIds)
  const hit = selected.length ? findClip(doc, selected[0]!) : null
  // A plain click selects a clip and its linked partner (e.g. video + its
  // embedded audio) together — still show details for that pair rather than
  // falling back to a generic "N selected" message.
  const isLinkedPair = selected.length === 2 && hit?.clip.linkedClipId === selected[1]
  const showDetails = hit && (selected.length === 1 || isLinkedPair)

  return (
    <aside className="inspector panel">
      <header className="panel-header">
        <h2>Inspector</h2>
      </header>
      {!hit ? (
        <p className="empty-hint">Select a clip to inspect</p>
      ) : !showDetails ? (
        <p className="empty-hint">{selected.length} clips selected</p>
      ) : (
        <dl className="inspector-grid">
          <dt>Clip</dt>
          <dd>{hit.clip.id}</dd>
          <dt>Track</dt>
          <dd>{hit.track.name}</dd>
          <dt>Asset</dt>
          <dd>{doc.assets.find((a) => a.id === hit.clip.assetId)?.name ?? '—'}</dd>
          <dt>Start</dt>
          <dd>{formatTimecode(hit.clip.timelineStart, doc.sequence.frameRate)}</dd>
          <dt>In</dt>
          <dd>{formatTimecode(hit.clip.in, doc.sequence.frameRate)}</dd>
          <dt>Out</dt>
          <dd>{formatTimecode(hit.clip.out, doc.sequence.frameRate)}</dd>
          <dt>Duration</dt>
          <dd>
            {formatTimecode(clipDurationTicks(hit.clip), doc.sequence.frameRate)} (
            {ticksToSeconds(clipDurationTicks(hit.clip), doc.sequence.frameRate).toFixed(2)}s)
          </dd>
          <dt>Speed</dt>
          <dd className="muted">100% (stub)</dd>
          {isLinkedPair ? (
            <>
              <dt>Linked</dt>
              <dd className="muted">
                {hit.track.type === 'video' ? 'Audio follows this clip (Alt+click to select alone)' : 'Attached to its video clip (Alt+click to select alone)'}
              </dd>
            </>
          ) : null}
        </dl>
      )}
      <div className="seq-meta">
        <h3>Sequence</h3>
        <p>
          {doc.sequence.width}×{doc.sequence.height} · {doc.sequence.frameRate} fps
        </p>
      </div>
    </aside>
  )
}
