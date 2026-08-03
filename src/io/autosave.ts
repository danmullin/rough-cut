import type { ProjectDocument } from '../types'
import { persistableDocument } from '../store/document'

const DB_NAME = 'rough-cut-autosave'
const STORE = 'drafts'
const KEY = 'current'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('autosave open failed'))
  })
}

export async function saveDraft(doc: ProjectDocument): Promise<void> {
  const db = await openDb()
  const payload = {
    savedAt: Date.now(),
    doc: persistableDocument(doc),
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(payload, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('autosave put failed'))
  })
  db.close()
}

export async function loadDraft(): Promise<ProjectDocument | null> {
  const db = await openDb()
  const row = await new Promise<{ doc: ProjectDocument } | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve((req.result as { doc: ProjectDocument } | undefined) ?? null)
    req.onerror = () => reject(req.error ?? new Error('autosave get failed'))
  })
  db.close()
  return row?.doc ?? null
}

export async function clearDraft(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('autosave clear failed'))
  })
  db.close()
}
