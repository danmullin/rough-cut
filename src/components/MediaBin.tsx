import { useDocStore } from '../store/documentStore'
import { importMediaFile, pickMediaFiles } from '../media/probe'
import { ticksToSeconds } from '../types'

export function MediaBin() {
  const assets = useDocStore((s) => s.doc.assets)
  const fps = useDocStore((s) => s.doc.sequence.frameRate)

  const importMedia = async () => {
    const files = await pickMediaFiles()
    for (const file of files) {
      try {
        const asset = await importMediaFile(file, fps)
        useDocStore.getState().addAssetAndPlace(asset, false)
      } catch (err) {
        useDocStore.getState().setStatus((err as Error).message)
      }
    }
  }

  return (
    <section className="media-bin panel">
      <header className="panel-header">
        <h2>Project</h2>
        <button type="button" className="ghost-btn" onClick={() => void importMedia()}>
          Import
        </button>
      </header>
      <ul className="media-list">
        {assets.length === 0 ? (
          <li className="empty-hint">Import MP4 / WebM / audio to begin</li>
        ) : (
          assets.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="media-item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/rough-cut-asset', a.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onDoubleClick={() => useDocStore.getState().placeAsset(a.id)}
                title="Drag to timeline or double-click to place"
              >
                <span className={`kind kind-${a.kind}`}>{a.kind === 'video' ? 'V' : 'A'}</span>
                <span className="media-name">{a.name}</span>
                <span className="media-dur">
                  {ticksToSeconds(a.durationTicks, fps).toFixed(1)}s
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}
