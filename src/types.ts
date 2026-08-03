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
}

export type TrackType = 'video' | 'audio'

export interface Track {
  id: string
  name: string
  type: TrackType
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
