import type { Clip, MediaAsset, ProjectDocument, Track, TrackType } from '../types'
import { clipEndTicks, newId } from '../types'

export const DEFAULT_FPS = 30
export const DEFAULT_WIDTH = 1280
export const DEFAULT_HEIGHT = 720
/** Premiere's default new-sequence track count (3 video, 3 stereo audio). */
export const DEFAULT_TRACK_COUNT = 3

function makeTracks(type: TrackType, count: number): Track[] {
  return Array.from({ length: count }, (_, i) => {
    const index = i + 1
    return {
      id: newId(`track_${type[0]}`),
      name: `${type === 'video' ? 'V' : 'A'}${index}`,
      type,
      index,
      clips: [],
    }
  })
}

export function createEmptyDocument(name = 'Untitled'): ProjectDocument {
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
    tracks: [...makeTracks('video', DEFAULT_TRACK_COUNT), ...makeTracks('audio', DEFAULT_TRACK_COUNT)],
  }
}

/** Tracks in Premiere's on-screen order: video descending (highest/topmost first), then audio ascending (closest to the video boundary first). */
export function orderedTracks(doc: ProjectDocument): Track[] {
  const video = doc.tracks.filter((t) => t.type === 'video').sort((a, b) => b.index - a.index)
  const audio = doc.tracks.filter((t) => t.type === 'audio').sort((a, b) => a.index - b.index)
  return [...video, ...audio]
}

/** Backfills a stable per-type index for tracks loaded from older projects that predate multi-track support. */
function backfillTrackIndexes(tracks: Track[]): Track[] {
  const counters: Partial<Record<TrackType, number>> = {}
  return tracks.map((t) => {
    if (typeof t.index === 'number' && t.index > 0) return t
    counters[t.type] = (counters[t.type] ?? 0) + 1
    return { ...t, index: counters[t.type]! }
  })
}

/** The clip on the highest (topmost) video track that covers `ticks` — video tracks don't composite here, so the top one with content wins, same as Premiere for opaque footage. */
export function topVideoClipAt(doc: ProjectDocument, ticks: number): { track: Track; clip: Clip } | null {
  const videoTracksDesc = doc.tracks.filter((t) => t.type === 'video').sort((a, b) => b.index - a.index)
  for (const track of videoTracksDesc) {
    const clip = clipAtTime(track, ticks)
    if (clip) return { track, clip }
  }
  return null
}

/** Every audio track's clip covering `ticks`, in ascending index order — all of these play back mixed together. */
export function activeAudioClipsAt(doc: ProjectDocument, ticks: number): { track: Track; clip: Clip }[] {
  const out: { track: Track; clip: Clip }[] = []
  for (const track of doc.tracks.filter((t) => t.type === 'audio').sort((a, b) => a.index - b.index)) {
    const clip = clipAtTime(track, ticks)
    if (clip) out.push({ track, clip })
  }
  return out
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
    tracks: backfillTrackIndexes(
      Array.isArray(d.tracks) && d.tracks.length >= 1
        ? d.tracks.map((t) => ({
            ...t,
            clips: Array.isArray(t.clips) ? t.clips : [],
          }))
        : empty.tracks,
    ),
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

function lowestIndexTrack(doc: ProjectDocument, type: TrackType): Track | undefined {
  return doc.tracks.filter((t) => t.type === type).sort((a, b) => a.index - b.index)[0]
}

export function placeAssetOnTimeline(
  doc: ProjectDocument,
  assetId: string,
  timelineStart?: number,
  targetTrackId?: string,
): ProjectDocument {
  const asset = doc.assets.find((a) => a.id === assetId)
  if (!asset) return doc
  const wantType: TrackType = asset.kind === 'video' ? 'video' : 'audio'
  const targeted = targetTrackId ? doc.tracks.find((t) => t.id === targetTrackId) : undefined
  const track = (targeted?.type === wantType ? targeted : undefined) ?? lowestIndexTrack(doc, wantType)
  if (!track) return doc

  const start =
    timelineStart ??
    track.clips.reduce((m, c) => Math.max(m, clipEndTicks(c)), 0)

  // Video imports carry their own embedded audio. Give it a linked clip on
  // the audio track so it shows up connected in the timeline, the way
  // Premiere links a clip's video and audio halves — even a silent video
  // just gets a paired clip that plays back silence. Line it up on the
  // same-numbered audio track when one exists (drop on V2 links to A2),
  // else fall back to the lowest audio track.
  const audioTrack =
    asset.kind === 'video'
      ? (doc.tracks.find((t) => t.type === 'audio' && t.index === track.index) ?? lowestIndexTrack(doc, 'audio'))
      : undefined
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
