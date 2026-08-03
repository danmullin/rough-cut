import type { ProjectDocument } from '../types'
import { ticksToSeconds } from '../types'
import { clipAtTime } from '../store/document'
import { ensureObjectUrl } from './assetCache'
import { composeFrame } from './compose'

export class PlaybackEngine {
  private raf = 0
  private lastTs = 0
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
    this.lastTs = performance.now()
    const loop = async (now: number) => {
      this.raf = requestAnimationFrame(loop)
      if (!this.isPlaying()) return
      const doc = this.getDoc()
      const dt = (now - this.lastTs) / 1000
      this.lastTs = now
      const advance = Math.round(dt * doc.sequence.frameRate)
      if (advance <= 0) return
      let next = this.getPlayhead() + advance
      const end = Math.max(doc.sequence.durationTicks, 1)
      if (next >= end) {
        next = end
        this.setPlaying(false)
        this.audio?.pause()
      }
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
