import type { ProjectDocument } from '../types'
import { normalizeDocument, persistableDocument } from '../store/document'

const EXT = '.roughcut.json'

export async function saveProjectFile(doc: ProjectDocument): Promise<void> {
  const payload = JSON.stringify(persistableDocument(doc), null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const name = `${doc.name.replace(/[^\w\- ]+/g, '').trim() || 'project'}${EXT}`

  const w = window as Window & {
    showSaveFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle>
  }
  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: 'Rough Cut project',
            accept: { 'application/json': [EXT] },
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
    }
  }

  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

export async function openProjectFile(): Promise<ProjectDocument | null> {
  const w = window as Window & {
    showOpenFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle[]>
  }
  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const [handle] = await w.showOpenFilePicker({
        types: [
          {
            description: 'Rough Cut project',
            accept: { 'application/json': ['.json', EXT] },
          },
        ],
        multiple: false,
      })
      const file = await handle.getFile()
      const text = await file.text()
      return normalizeDocument(JSON.parse(text))
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null
      throw err
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.roughcut.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      try {
        resolve(normalizeDocument(JSON.parse(await file.text())))
      } catch {
        resolve(null)
      }
    }
    input.click()
  })
}
