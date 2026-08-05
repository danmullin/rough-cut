export type AssetKind = 'video' | 'audio'

export type ToolId = 'select' | 'razor' | 'hand'

export interface MediaAsset {
  id: string
  name: string
  kind: AssetKind
  /** IndexedDB blob key */
  blobKey: string
  /** Duration in ticks at the asset's native rate (stored as sequence ticks via fps) */
  durationTicks: number
  width: number
  height: number
  sampleRate: number
  /** Object URL cache hint — not persisted */
  objectUrl?: string
}

export interface Clip {
  id: string
  assetId: string
  trackId: string
  /** Timeline start in sequence ticks */
  timelineStart: number
  /** Source in-point (ticks) */
  in: number
  /** Source out-point exclusive (ticks) */
  out: number
  /**
   * Id of the clip this one is linked to (e.g. a video clip's embedded audio,
   * placed as its own clip on an audio track). Mirrors Premiere's linked
   * selection: a plain click/drag affects both sides, Alt overrides it to
   * act on just the one you grabbed.
   */
  linkedClipId?: string
}

export type TrackType = 'video' | 'audio'

export interface Track {
  id: string
  name: string
  type: TrackType
  /**
   * 1-based rank within its type. Drives display order the way Premiere
   * stacks tracks — video ascends upward (higher index = higher on screen,
   * and wins when more than one video track has a clip at the same time),
   * audio ascends downward (higher index = further from the video/audio
   * boundary).
   */
  index: number
  clips: Clip[]
}

export interface Sequence {
  name: string
  frameRate: number
  width: number
  height: number
  /** Computed / padded length in ticks */
  durationTicks: number
}

export interface ProjectDocument {
  version: 1
  name: string
  sequence: Sequence
  assets: MediaAsset[]
  tracks: Track[]
}

export interface FeatureItem {
  name: string
  shortcut?: string
  note?: string
}

export interface FeatureGroup {
  title: string
  items: FeatureItem[]
}

export function ticksToSeconds(ticks: number, fps: number): number {
  return ticks / fps
}

export function secondsToTicks(seconds: number, fps: number): number {
  return Math.max(0, Math.round(seconds * fps))
}

export function clipDurationTicks(clip: Clip): number {
  return Math.max(0, clip.out - clip.in)
}

export function clipEndTicks(clip: Clip): number {
  return clip.timelineStart + clipDurationTicks(clip)
}

export function newId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}
