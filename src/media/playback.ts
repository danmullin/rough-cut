import type { ProjectDocument } from '../types'
import { ticksToSeconds } from '../types'
import { clipAtTime } from '../store/document'
import { ensureObjectUrl } from './assetCache'
import { composeFrame } from './compose'

export class PlaybackEngine {
  private raf = 0
  /** Wall-clock time + playhead tick at the moment the current play run began or was last resynced. */
  private anchorTime = 0
  private anchorTicks = 0
  /** Last tick value *this engine* wrote to the store — used to detect external seeks (scrub) mid-playback. */
  private lastSetTicks = -1
  private audio: HTMLAudioElement | null = null
  private audioUrl: string | null = null
  private audioClipId: string | null = null
  private getDoc: () => ProjectDocument
  private getPlayhead: () => number
  private setPlayhead: (t: number) => void
  private isPlaying: () => boolean
  private setPlaying: (p: boolean) => void
  private canvas: HTMLCanvasElement

  constructor(
    getDoc: () => ProjectDocument,
    getPlayhead: () => number,
    setPlayhead: (t: number) => void,
    isPlaying: () => boolean,
    setPlaying: (p: boolean) => void,
    canvas: HTMLCanvasElement,
  ) {
    this.getDoc = getDoc
    this.getPlayhead = getPlayhead
    this.setPlayhead = setPlayhead
    this.isPlaying = isPlaying
    this.setPlaying = setPlaying
    this.canvas = canvas
  }

  setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  async paint(ticks?: number): Promise<void> {
    const doc = this.getDoc()
    const t = ticks ?? this.getPlayhead()
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    if (this.canvas.width !== doc.sequence.width || this.canvas.height !== doc.sequence.height) {
      this.canvas.width = doc.sequence.width
      this.canvas.height = doc.sequence.height
    }
    await composeFrame(doc, t, ctx)
  }

  private async syncAudio(ticks: number): Promise<void> {
    const doc = this.getDoc()
    const aTrack = doc.tracks.find((t) => t.type === 'audio')
    const vTrack = doc.tracks.find((t) => t.type === 'video')
    // Prefer dedicated audio track; else use video clip's audio via HTMLAudioElement from same blob
    let clip = aTrack ? clipAtTime(aTrack, ticks) : null
    let asset = clip ? doc.assets.find((a) => a.id === clip!.assetId) : null
    if (!clip && vTrack) {
      clip = clipAtTime(vTrack, ticks)
      asset = clip ? doc.assets.find((a) => a.id === clip!.assetId) : null
    }
    if (!clip || !asset) {
      if (this.audio) {
        this.audio.pause()
        this.audioClipId = null
      }
      return
    }
    const url = await ensureObjectUrl(asset.blobKey)
    if (!this.audio || this.audioUrl !== url) {
      if (this.audio) this.audio.pause()
      this.audio = new Audio(url)
      this.audioUrl = url
      this.audioClipId = null
    }
    const srcSec = ticksToSeconds(clip.in + (ticks - clip.timelineStart), doc.sequence.frameRate)
    if (this.audioClipId !== clip.id || Math.abs(this.audio.currentTime - srcSec) > 0.25) {
      this.audio.currentTime = srcSec
      this.audioClipId = clip.id
    }
    if (this.isPlaying() && this.audio.paused) {
      void this.audio.play().catch(() => {})
    }
  }

  start(): void {
    if (this.raf) return
    const loop = async (now: number) => {
      this.raf = requestAnimationFrame(loop)
      if (!this.isPlaying()) {
        // Force a resync next time playback starts, however long from now that is.
        this.lastSetTicks = -1
        return
      }
      const current = this.getPlayhead()
      if (this.lastSetTicks === -1 || current !== this.lastSetTicks) {
        // Playback just (re)started, or the playhead moved out from under us
        // (scrub-while-playing) — rebase the clock instead of integrating a
        // stale delta, which previously caused a huge jump-to-end on resume.
        this.anchorTime = now
        this.anchorTicks = current
        this.lastSetTicks = current
        await this.syncAudio(current)
        return
      }
      const doc = this.getDoc()
      const elapsedSec = (now - this.anchorTime) / 1000
      let next = this.anchorTicks + Math.round(elapsedSec * doc.sequence.frameRate)
      const end = Math.max(doc.sequence.durationTicks, 1)
      if (next >= end) {
        next = end
        this.setPlaying(false)
        this.audio?.pause()
      }
      if (next === current) return
      this.lastSetTicks = next
      this.setPlayhead(next)
      await this.paint(next)
      await this.syncAudio(next)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stopAudio(): void {
    this.audio?.pause()
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.audio?.pause()
    this.audio = null
  }
}
