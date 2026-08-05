import type { Clip, MediaAsset, ProjectDocument, Track } from '../types'
import { clipEndTicks, newId } from '../types'

export const DEFAULT_FPS = 30
export const DEFAULT_WIDTH = 1280
export const DEFAULT_HEIGHT = 720

export function createEmptyDocument(name = 'Untitled'): ProjectDocument {
  const vTrack: Track = {
    id: 'track_v1',
    name: 'V1',
    type: 'video',
    clips: [],
  }
  const aTrack: Track = {
    id: 'track_a1',
    name: 'A1',
    type: 'audio',
    clips: [],
  }
  return {
    version: 1,
    name,
    sequence: {
      name: 'Sequence 01',
      frameRate: DEFAULT_FPS,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      durationTicks: DEFAULT_FPS * 10,
    },
    assets: [],
    tracks: [vTrack, aTrack],
  }
}

export function normalizeDocument(raw: unknown): ProjectDocument {
  const empty = createEmptyDocument()
  if (!raw || typeof raw !== 'object') return empty
  const d = raw as Partial<ProjectDocument>
  const doc: ProjectDocument = {
    version: 1,
    name: typeof d.name === 'string' ? d.name : empty.name,
    sequence: {
      ...empty.sequence,
      ...(d.sequence && typeof d.sequence === 'object' ? d.sequence : {}),
      frameRate: d.sequence?.frameRate || DEFAULT_FPS,
      width: d.sequence?.width || DEFAULT_WIDTH,
      height: d.sequence?.height || DEFAULT_HEIGHT,
    },
    assets: Array.isArray(d.assets) ? d.assets : [],
    tracks:
      Array.isArray(d.tracks) && d.tracks.length >= 1
        ? d.tracks.map((t) => ({
            ...t,
            clips: Array.isArray(t.clips) ? t.clips : [],
          }))
        : empty.tracks,
  }
  doc.sequence.durationTicks = Math.max(
    doc.sequence.durationTicks,
    computeContentEnd(doc),
    DEFAULT_FPS * 5,
  )
  return doc
}

export function computeContentEnd(doc: ProjectDocument): number {
  let end = 0
  for (const track of doc.tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clipEndTicks(clip))
    }
  }
  return end
}

export function findClip(doc: ProjectDocument, clipId: string): { track: Track; clip: Clip } | null {
  for (const track of doc.tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return { track, clip }
  }
  return null
}

export function clipAtTime(
  track: Track,
  ticks: number,
): Clip | null {
  for (const clip of track.clips) {
    if (ticks >= clip.timelineStart && ticks < clipEndTicks(clip)) return clip
  }
  return null
}

export function persistableDocument(doc: ProjectDocument): ProjectDocument {
  return {
    ...doc,
    assets: doc.assets.map(({ objectUrl: _u, ...rest }) => rest),
  }
}

export function addAssetToDoc(doc: ProjectDocument, asset: MediaAsset): ProjectDocument {
  return { ...doc, assets: [...doc.assets, asset] }
}

export function placeAssetOnTimeline(
  doc: ProjectDocument,
  assetId: string,
  timelineStart?: number,
): ProjectDocument {
  const asset = doc.assets.find((a) => a.id === assetId)
  if (!asset) return doc
  const track =
    asset.kind === 'video'
      ? doc.tracks.find((t) => t.type === 'video')
      : doc.tracks.find((t) => t.type === 'audio')
  if (!track) return doc

  const start =
    timelineStart ??
    track.clips.reduce((m, c) => Math.max(m, clipEndTicks(c)), 0)

  // Video imports carry their own embedded audio. Give it a linked clip on
  // the audio track so it shows up connected in the timeline, the way
  // Premiere links a clip's video and audio halves — even a silent video
  // just gets a paired clip that plays back silence.
  const audioTrack = asset.kind === 'video' ? doc.tracks.find((t) => t.type === 'audio') : undefined
  const clipId = newId('clip')
  const audioClipId = audioTrack ? newId('clip') : undefined

  const clip: Clip = {
    id: clipId,
    assetId: asset.id,
    trackId: track.id,
    timelineStart: start,
    in: 0,
    out: asset.durationTicks,
    linkedClipId: audioClipId,
  }

  let tracks = doc.tracks.map((t) =>
    t.id === track.id ? { ...t, clips: [...t.clips, clip] } : t,
  )

  if (audioTrack && audioClipId) {
    const audioClip: Clip = {
      id: audioClipId,
      assetId: asset.id,
      trackId: audioTrack.id,
      timelineStart: start,
      in: 0,
      out: asset.durationTicks,
      linkedClipId: clipId,
    }
    tracks = tracks.map((t) =>
      t.id === audioTrack.id ? { ...t, clips: [...t.clips, audioClip] } : t,
    )
  }

  const next = { ...doc, tracks }
  next.sequence = {
    ...next.sequence,
    durationTicks: Math.max(next.sequence.durationTicks, computeContentEnd(next) + next.sequence.frameRate * 2),
  }
  return next
}
