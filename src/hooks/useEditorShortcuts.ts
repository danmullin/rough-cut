import { useEffect } from 'react'
import { useDocStore } from '../store/documentStore'
import { importMediaFile, pickMediaFiles } from '../media/probe'
import { openProjectFile, saveProjectFile } from '../io/projectFile'
import { downloadBlob, exportSequenceMp4 } from '../media/exportMp4'
import { exportSupported } from '../media/capabilities'

function typingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useEditorShortcuts(): void {
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (typingTarget(e.target)) return
      const s = useDocStore.getState()
      if (s.helpOpen || s.settingsOpen) {
        if (e.key === 'Escape') {
          s.setHelpOpen(false)
          s.setSettingsOpen(false)
        }
        return
      }

      const mod = e.ctrlKey || e.metaKey
      const key = e.key

      if (key === '?' || (key === '/' && e.shiftKey)) {
        e.preventDefault()
        s.setHelpOpen(true)
        return
      }

      if (key === ' ' || key === 'Spacebar') {
        e.preventDefault()
        s.setPlaying(!s.playing)
        return
      }

      if (key === 'v' || key === 'V') {
        s.setTool('select')
        return
      }
      if (key === 'c' || key === 'C') {
        if (!mod) s.setTool('razor')
        return
      }
      if (key === 'h' || key === 'H') {
        s.setTool('hand')
        return
      }

      if (key === 'Home') {
        e.preventDefault()
        s.setPlayhead(0)
        return
      }
      if (key === 'End') {
        e.preventDefault()
        s.setPlayhead(s.doc.sequence.durationTicks)
        return
      }
      if (key === 'ArrowLeft') {
        e.preventDefault()
        s.setPlayhead(s.playheadTicks - (e.shiftKey ? s.doc.sequence.frameRate : 1))
        return
      }
      if (key === 'ArrowRight') {
        e.preventDefault()
        s.setPlayhead(s.playheadTicks + (e.shiftKey ? s.doc.sequence.frameRate : 1))
        return
      }

      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault()
        s.deleteSelected()
        return
      }

      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && key === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      if (mod && (key === 'k' || key === 'K')) {
        e.preventDefault()
        s.razorAtPlayhead()
        return
      }
      if (mod && (key === '=' || key === '+')) {
        e.preventDefault()
        s.setTimelineZoom(s.timelineZoom + 2)
        return
      }
      if (mod && key === '-') {
        e.preventDefault()
        s.setTimelineZoom(s.timelineZoom - 2)
        return
      }

      if (mod && (key === 'i' || key === 'I')) {
        e.preventDefault()
        const files = await pickMediaFiles()
        for (const file of files) {
          try {
            const asset = await importMediaFile(file, s.doc.sequence.frameRate)
            useDocStore.getState().addAssetAndPlace(asset, true)
          } catch (err) {
            useDocStore.getState().setStatus((err as Error).message)
          }
        }
        return
      }

      if (mod && (key === 's' || key === 'S')) {
        e.preventDefault()
        await saveProjectFile(s.getPersistable())
        s.setStatus('Project saved')
        return
      }

      if (mod && (key === 'o' || key === 'O')) {
        e.preventDefault()
        const doc = await openProjectFile()
        if (doc) s.loadDocument(doc)
        return
      }

      if (mod && (key === 'e' || key === 'E')) {
        e.preventDefault()
        if (!exportSupported()) {
          s.setStatus("This browser doesn't support WebCodecs export")
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
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
