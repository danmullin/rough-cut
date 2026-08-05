import { create } from 'zustand'
import type { Clip, ProjectDocument, ToolId, TrackType } from '../types'
import { clipDurationTicks, clipEndTicks, newId } from '../types'
import {
  computeContentEnd,
  createEmptyDocument,
  findClip,
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
  selectClips: (ids: string[], opts?: { additive?: boolean; ignoreLink?: boolean }) => void
  clearSelection: () => void
  setPlayhead: (ticks: number) => void
  setPlaying: (playing: boolean) => void
  setTimelineZoom: (z: number) => void
  setHelpOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setExportBusy: (busy: boolean) => void
  setStatus: (s: string) => void

  addAssetAndPlace: (asset: ProjectDocument['assets'][number], place?: boolean) => void
  placeAsset: (assetId: string, timelineStart?: number, targetTrackId?: string) => void
  razorAtPlayhead: () => void
  deleteSelected: () => void
  moveClip: (clipId: string, newStart: number) => void
  trimClip: (clipId: string, edge: 'in' | 'out', timelineTick: number) => void
  renameProject: (name: string) => void
  addTrack: (type: TrackType) => void
  removeTrack: (trackId: string) => void
}

function clampPlayhead(doc: ProjectDocument, ticks: number): number {
  return Math.max(0, Math.min(ticks, Math.max(0, doc.sequence.durationTicks)))
}

/** Pulls in each id's linked partner (e.g. a video clip's paired audio clip) so a plain click/drag/delete affects both halves, like Premiere's linked selection. */
function expandLinkedIds(doc: ProjectDocument, ids: string[]): string[] {
  const out = new Set(ids)
  for (const id of ids) {
    const partner = findClip(doc, id)?.clip.linkedClipId
    if (partner) out.add(partner)
  }
  return [...out]
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
  selectClips: (ids, opts) => {
    const { additive = false, ignoreLink = false } = opts ?? {}
    const expanded = ignoreLink ? ids : expandLinkedIds(get().doc, ids)
    if (!additive) {
      set({ selectedClipIds: expanded })
      return
    }
    const cur = new Set(get().selectedClipIds)
    for (const id of expanded) {
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

  placeAsset: (assetId, timelineStart, targetTrackId) => {
    get().pushHistory()
    const doc = placeAssetOnTimeline(get().doc, assetId, timelineStart, targetTrackId)
    set({ doc: normalizeDocument(doc), status: 'Clip placed' })
  },

  razorAtPlayhead: () => {
    const { doc, playheadTicks, selectedClipIds } = get()

    const willCut = (clip: Clip): boolean => {
      if (!(playheadTicks > clip.timelineStart && playheadTicks < clipEndTicks(clip))) return false
      if (selectedClipIds.length && !selectedClipIds.includes(clip.id)) return false
      const mid = clip.in + (playheadTicks - clip.timelineStart)
      return mid > clip.in && mid < clip.out
    }

    // A left fragment keeps its clip's original id, so an unrelated linked
    // partner's `linkedClipId` (pointing at that id) stays valid untouched.
    // Only right fragments get a fresh id — track those so a linked pair cut
    // in the same pass gets re-paired right-to-right instead of dangling.
    const rightFragmentId = new Map<string, string>()
    for (const track of doc.tracks) {
      for (const clip of track.clips) {
        if (willCut(clip)) rightFragmentId.set(clip.id, newId('clip'))
      }
    }
    if (!rightFragmentId.size) {
      set({ status: 'Nothing to cut at playhead' })
      return
    }

    const tracks = doc.tracks.map((track) => {
      const nextClips: Clip[] = []
      for (const clip of track.clips) {
        const rightId = rightFragmentId.get(clip.id)
        if (!rightId) {
          nextClips.push(clip)
          continue
        }
        const mid = clip.in + (playheadTicks - clip.timelineStart)
        nextClips.push({ ...clip, out: mid })
        nextClips.push({
          id: rightId,
          assetId: clip.assetId,
          trackId: clip.trackId,
          timelineStart: playheadTicks,
          in: mid,
          out: clip.out,
          linkedClipId: clip.linkedClipId ? rightFragmentId.get(clip.linkedClipId) : undefined,
        })
      }
      return { ...track, clips: nextClips }
    })

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
      clips: t.clips
        .filter((c) => !kill.has(c.id))
        // Leave a surviving partner (e.g. Alt+click deleted just the audio
        // half) pointing at nothing, rather than a dangling clip id.
        .map((c) => (c.linkedClipId && kill.has(c.linkedClipId) ? { ...c, linkedClipId: undefined } : c)),
    }))
    set({
      doc: normalizeDocument({ ...doc, tracks }),
      selectedClipIds: [],
      status: selectedClipIds.length > 1 ? 'Deleted clips' : 'Deleted clip',
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

  addTrack: (type) => {
    const { doc } = get()
    get().pushHistory()
    // New tracks land at the outer edge of their group — a fresh video track
    // becomes the new topmost (V-next), a fresh audio track the new bottom
    // (A-next) — matching where Premiere adds a track by default.
    const nextIndex = doc.tracks.filter((t) => t.type === type).reduce((m, t) => Math.max(m, t.index), 0) + 1
    const track = {
      id: newId(`track_${type[0]}`),
      name: `${type === 'video' ? 'V' : 'A'}${nextIndex}`,
      type,
      index: nextIndex,
      clips: [],
    }
    set({
      doc: normalizeDocument({ ...doc, tracks: [...doc.tracks, track] }),
      status: `Added ${track.name}`,
    })
  },

  removeTrack: (trackId) => {
    const { doc } = get()
    const track = doc.tracks.find((t) => t.id === trackId)
    if (!track) return
    const sameType = doc.tracks.filter((t) => t.type === track.type)
    if (sameType.length <= 1) {
      set({ status: `Can't remove the last ${track.type} track` })
      return
    }
    if (
      track.clips.length &&
      !window.confirm(`Delete ${track.name}? This removes ${track.clips.length} clip(s) on it.`)
    ) {
      return
    }
    get().pushHistory()
    const killedClipIds = new Set(track.clips.map((c) => c.id))
    // Renumber the survivors of this type contiguously (1..N) so deleting a
    // middle track shifts the rest down, same as Premiere.
    let counter = 0
    const tracks = doc.tracks
      .filter((t) => t.id !== trackId)
      .map((t) => {
        if (t.type !== track.type) return t
        counter += 1
        return { ...t, index: counter, name: `${track.type === 'video' ? 'V' : 'A'}${counter}` }
      })
      .map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.linkedClipId && killedClipIds.has(c.linkedClipId) ? { ...c, linkedClipId: undefined } : c,
        ),
      }))
    set({
      doc: normalizeDocument({ ...doc, tracks }),
      selectedClipIds: get().selectedClipIds.filter((id) => !killedClipIds.has(id)),
      status: `Removed ${track.name}`,
    })
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
