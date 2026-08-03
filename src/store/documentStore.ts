import { create } from 'zustand'
import type { ProjectDocument, ToolId } from '../types'
import { clipDurationTicks, clipEndTicks, newId } from '../types'
import {
  computeContentEnd,
  createEmptyDocument,
  normalizeDocument,
  persistableDocument,
  placeAssetOnTimeline,
} from './document'

const MAX_HISTORY = 50

type DocSlice = ProjectDocument

interface EditorState {
  doc: ProjectDocument
  past: DocSlice[]
  future: DocSlice[]
  selectedClipIds: string[]
  tool: ToolId
  playheadTicks: number
  timelineZoom: number
  playing: boolean
  helpOpen: boolean
  settingsOpen: boolean
  exportBusy: boolean
  status: string

  pushHistory: () => void
  undo: () => void
  redo: () => void
  setDoc: (doc: ProjectDocument, recordHistory?: boolean) => void
  loadDocument: (doc: ProjectDocument) => void
  getPersistable: () => ProjectDocument
  newProject: () => void

  setTool: (tool: ToolId) => void
  selectClips: (ids: string[], additive?: boolean) => void
  clearSelection: () => void
  setPlayhead: (ticks: number) => void
  setPlaying: (playing: boolean) => void
  setTimelineZoom: (z: number) => void
  setHelpOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setExportBusy: (busy: boolean) => void
  setStatus: (s: string) => void

  addAssetAndPlace: (asset: ProjectDocument['assets'][number], place?: boolean) => void
  placeAsset: (assetId: string, timelineStart?: number) => void
  razorAtPlayhead: () => void
  deleteSelected: () => void
  moveClip: (clipId: string, newStart: number) => void
  trimClip: (clipId: string, edge: 'in' | 'out', timelineTick: number) => void
  renameProject: (name: string) => void
}

function clampPlayhead(doc: ProjectDocument, ticks: number): number {
  return Math.max(0, Math.min(ticks, Math.max(0, doc.sequence.durationTicks)))
}

export const useDocStore = create<EditorState>((set, get) => ({
  doc: createEmptyDocument(),
  past: [],
  future: [],
  selectedClipIds: [],
  tool: 'select',
  playheadTicks: 0,
  timelineZoom: 12,
  playing: false,
  helpOpen: false,
  settingsOpen: false,
  exportBusy: false,
  status: 'Ready',

  pushHistory: () => {
    const { doc, past } = get()
    const snap = structuredClone(persistableDocument(doc))
    set({
      past: [...past.slice(-(MAX_HISTORY - 1)), snap],
      future: [],
    })
  },

  undo: () => {
    const { past, doc, future } = get()
    if (!past.length) return
    const prev = past[past.length - 1]!
    set({
      past: past.slice(0, -1),
      future: [structuredClone(persistableDocument(doc)), ...future].slice(0, MAX_HISTORY),
      doc: normalizeDocument(prev),
      playing: false,
    })
  },

  redo: () => {
    const { future, doc, past } = get()
    if (!future.length) return
    const next = future[0]!
    set({
      future: future.slice(1),
      past: [...past, structuredClone(persistableDocument(doc))].slice(-MAX_HISTORY),
      doc: normalizeDocument(next),
      playing: false,
    })
  },

  setDoc: (doc, recordHistory = true) => {
    if (recordHistory) get().pushHistory()
    set({ doc: normalizeDocument(doc) })
  },

  loadDocument: (doc) => {
    set({
      doc: normalizeDocument(doc),
      past: [],
      future: [],
      selectedClipIds: [],
      playheadTicks: 0,
      playing: false,
      status: `Loaded “${doc.name}”`,
    })
  },

  getPersistable: () => persistableDocument(get().doc),

  newProject: () => {
    get().pushHistory()
    set({
      doc: createEmptyDocument(),
      selectedClipIds: [],
      playheadTicks: 0,
      playing: false,
      status: 'New project',
    })
  },

  setTool: (tool) => set({ tool }),
  selectClips: (ids, additive = false) => {
    if (!additive) {
      set({ selectedClipIds: ids })
      return
    }
    const cur = new Set(get().selectedClipIds)
    for (const id of ids) {
      if (cur.has(id)) cur.delete(id)
      else cur.add(id)
    }
    set({ selectedClipIds: [...cur] })
  },
  clearSelection: () => set({ selectedClipIds: [] }),
  setPlayhead: (ticks) => set({ playheadTicks: clampPlayhead(get().doc, ticks) }),
  setPlaying: (playing) => set({ playing }),
  setTimelineZoom: (z) => set({ timelineZoom: Math.max(2, Math.min(64, z)) }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setExportBusy: (exportBusy) => set({ exportBusy }),
  setStatus: (status) => set({ status }),

  addAssetAndPlace: (asset, place = true) => {
    get().pushHistory()
    let doc = { ...get().doc, assets: [...get().doc.assets, asset] }
    if (place) doc = placeAssetOnTimeline(doc, asset.id)
    set({
      doc: normalizeDocument(doc),
      status: `Imported ${asset.name}`,
    })
  },

  placeAsset: (assetId, timelineStart) => {
    get().pushHistory()
    const doc = placeAssetOnTimeline(get().doc, assetId, timelineStart)
    set({ doc: normalizeDocument(doc), status: 'Clip placed' })
  },

  razorAtPlayhead: () => {
    const { doc, playheadTicks, selectedClipIds } = get()
    let changed = false
    const tracks = doc.tracks.map((track) => {
      const nextClips = []
      for (const clip of track.clips) {
        const end = clipEndTicks(clip)
        const hit =
          playheadTicks > clip.timelineStart &&
          playheadTicks < end &&
          (selectedClipIds.length === 0 || selectedClipIds.includes(clip.id))
        if (!hit) {
          nextClips.push(clip)
          continue
        }
        const offset = playheadTicks - clip.timelineStart
        const mid = clip.in + offset
        if (mid <= clip.in || mid >= clip.out) {
          nextClips.push(clip)
          continue
        }
        changed = true
        nextClips.push({
          ...clip,
          out: mid,
        })
        nextClips.push({
          id: newId('clip'),
          assetId: clip.assetId,
          trackId: clip.trackId,
          timelineStart: playheadTicks,
          in: mid,
          out: clip.out,
        })
      }
      return { ...track, clips: nextClips }
    })
    if (!changed) {
      set({ status: 'Nothing to cut at playhead' })
      return
    }
    get().pushHistory()
    set({
      doc: normalizeDocument({ ...doc, tracks }),
      status: 'Razor cut',
    })
  },

  deleteSelected: () => {
    const { doc, selectedClipIds } = get()
    if (!selectedClipIds.length) return
    get().pushHistory()
    const kill = new Set(selectedClipIds)
    const tracks = doc.tracks.map((t) => ({
      ...t,
      clips: t.clips.filter((c) => !kill.has(c.id)),
    }))
    set({
      doc: normalizeDocument({ ...doc, tracks }),
      selectedClipIds: [],
      status: 'Deleted clip(s)',
    })
  },

  moveClip: (clipId, newStart) => {
    const { doc } = get()
    get().pushHistory()
    const tracks = doc.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((c) =>
        c.id === clipId
          ? { ...c, timelineStart: Math.max(0, Math.round(newStart)) }
          : c,
      ),
    }))
    const next = normalizeDocument({ ...doc, tracks })
    next.sequence.durationTicks = Math.max(
      next.sequence.durationTicks,
      computeContentEnd(next) + next.sequence.frameRate * 2,
    )
    set({ doc: next })
  },

  trimClip: (clipId, edge, timelineTick) => {
    const { doc } = get()
    get().pushHistory()
    const tracks = doc.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((c) => {
        if (c.id !== clipId) return c
        if (edge === 'in') {
          const newStart = Math.max(0, Math.min(timelineTick, clipEndTicks(c) - 1))
          const delta = newStart - c.timelineStart
          const newIn = c.in + delta
          if (newIn >= c.out) return c
          return { ...c, timelineStart: newStart, in: newIn }
        }
        const end = Math.max(c.timelineStart + 1, timelineTick)
        const newOut = c.in + (end - c.timelineStart)
        if (newOut <= c.in) return c
        const asset = doc.assets.find((a) => a.id === c.assetId)
        const maxOut = asset?.durationTicks ?? newOut
        return { ...c, out: Math.min(newOut, maxOut) }
      }),
    }))
    set({ doc: normalizeDocument({ ...doc, tracks }) })
  },

  renameProject: (name) => {
    set({ doc: { ...get().doc, name } })
  },
}))

export function formatTimecode(ticks: number, fps: number): string {
  const totalSec = Math.max(0, ticks) / fps
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = Math.floor(totalSec % 60)
  const f = Math.floor(ticks % fps)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return h > 0
    ? `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`
    : `${pad(m)}:${pad(s)}:${pad(f)}`
}

export function selectedClipDurationLabel(): string {
  const { doc, selectedClipIds } = useDocStore.getState()
  if (selectedClipIds.length !== 1) return ''
  for (const t of doc.tracks) {
    const c = t.clips.find((x) => x.id === selectedClipIds[0])
    if (c) return `${clipDurationTicks(c)}f`
  }
  return ''
}
