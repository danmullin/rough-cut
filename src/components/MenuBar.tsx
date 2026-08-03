import { useDocStore } from '../store/documentStore'
import { importMediaFile, pickMediaFiles } from '../media/probe'
import { openProjectFile, saveProjectFile } from '../io/projectFile'
import { downloadBlob, exportSequenceMp4 } from '../media/exportMp4'
import { exportSupported } from '../media/capabilities'

export function MenuBar() {
  const doc = useDocStore((s) => s.doc)
  const status = useDocStore((s) => s.status)
  const exportBusy = useDocStore((s) => s.exportBusy)

  const importMedia = async () => {
    const files = await pickMediaFiles()
    const fps = useDocStore.getState().doc.sequence.frameRate
    for (const file of files) {
      try {
        const asset = await importMediaFile(file, fps)
        useDocStore.getState().addAssetAndPlace(asset, true)
      } catch (err) {
        useDocStore.getState().setStatus((err as Error).message)
      }
    }
  }

  const doExport = async () => {
    const s = useDocStore.getState()
    if (!exportSupported()) {
      s.setStatus('Export needs Chrome/Edge (WebCodecs)')
      return
    }
    if (s.exportBusy) return
    s.setExportBusy(true)
    s.setPlaying(false)
    try {
      const blob = await exportSequenceMp4(s.doc, (r, label) => {
        useDocStore.getState().setStatus(`${label} (${Math.round(r * 100)}%)`)
      })
      downloadBlob(blob, `${s.doc.name || 'rough-cut'}.mp4`)
      s.setStatus('Export complete')
    } catch (err) {
      s.setStatus((err as Error).message)
    } finally {
      s.setExportBusy(false)
    }
  }

  return (
    <header className="menu-bar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <div>
          <strong>Rough Cut</strong>
          <span className="brand-sub">web NLE</span>
        </div>
      </div>
      <nav className="menu-actions">
        <button type="button" onClick={() => useDocStore.getState().newProject()}>
          New
        </button>
        <button
          type="button"
          onClick={async () => {
            const opened = await openProjectFile()
            if (opened) useDocStore.getState().loadDocument(opened)
          }}
        >
          Open
        </button>
        <button
          type="button"
          onClick={async () => {
            await saveProjectFile(useDocStore.getState().getPersistable())
            useDocStore.getState().setStatus('Project saved')
          }}
        >
          Save
        </button>
        <button type="button" onClick={() => void importMedia()}>
          Import
        </button>
        <button type="button" disabled={exportBusy} onClick={() => void doExport()}>
          {exportBusy ? 'Exporting…' : 'Export MP4'}
        </button>
        <button type="button" onClick={() => useDocStore.getState().setHelpOpen(true)}>
          Help
        </button>
      </nav>
      <div className="menu-meta">
        <input
          className="project-name"
          value={doc.name}
          aria-label="Project name"
          onChange={(e) => useDocStore.getState().renameProject(e.target.value)}
        />
        <span className="status-pill">{status}</span>
      </div>
    </header>
  )
}
