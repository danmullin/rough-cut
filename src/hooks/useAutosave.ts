import { useEffect, useRef } from 'react'
import { useDocStore } from '../store/documentStore'
import { loadDraft, saveDraft } from '../io/autosave'

export function useAutosave(): void {
  const timer = useRef(0)
  const restored = useRef(false)

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    void loadDraft().then((doc) => {
      if (!doc) return
      if (doc.assets.length === 0 && doc.tracks.every((t) => t.clips.length === 0)) return
      const ok = window.confirm('Restore autosaved draft?')
      if (ok) useDocStore.getState().loadDocument(doc)
    })
  }, [])

  useEffect(() => {
    const unsub = useDocStore.subscribe((state, prev) => {
      if (state.doc === prev.doc) return
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        void saveDraft(state.doc)
      }, 800)
    })
    return () => {
      unsub()
      window.clearTimeout(timer.current)
    }
  }, [])
}
