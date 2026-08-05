import type { ProjectDocument } from '../types'
import { ticksToSeconds } from '../types'
import { activeAudioClipsAt, computeContentEnd } from '../store/document'
import { ensureObjectUrl } from './assetCache'
import { composeFrame, composeFrameLive } from './compose'

interface TrackAudioState {
  el: HTMLAudioElement
  url: string
  clipId: string | null
}

export class PlaybackEngine {
  private raf = 0
  /** Wall-clock time + playhead tick at the moment the current play run began or was last resynced. */
  private anchorTime = 0
  private anchorTicks = 0
  /** Last tick value *this engine* wrote to the store — used to detect external seeks (scrub) mid-playback. */
  private lastSetTicks = -1
  /** One Audio element per audio track that currently has a clip playing — every track mixes together, like Premiere. */
  private audioByTrack = new Map<string, TrackAudioState>()
  /** Video currently playing natively during a play run (see `paintPlaying`). */
  private playingVideo: HTMLVideoElement | null = null
  private playingClipId: string | null = null
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

  /** Playback-only paint: lets the active clip's video decode forward natively (see `composeFrameLive`). */
  private async paintPlaying(ticks: number): Promise<void> {
    const doc = this.getDoc()
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    if (this.canvas.width !== doc.sequence.width || this.canvas.height !== doc.sequence.height) {
      this.canvas.width = doc.sequence.width
      this.canvas.height = doc.sequence.height
    }
    const { clipId, video } = await composeFrameLive(doc, ticks, ctx, this.playingClipId)
    if (video !== this.playingVideo) this.playingVideo?.pause()
    this.playingClipId = clipId
    this.playingVideo = video
  }

  /** Pauses whatever video is currently decoding for playback (stop, scrub-to-paused, destroy). */
  private pausePlayingVideo(): void {
    this.playingVideo?.pause()
    this.playingVideo = null
    this.playingClipId = null
  }

  /**
   * Syncs one Audio element per audio track that has a clip at `ticks`, all
   * mixed together (browsers play multiple concurrent Audio elements
   * simultaneously with no extra work) — matches Premiere, where every
   * audio track is heard at once rather than only the first one.
   */
  private async syncAudio(ticks: number): Promise<void> {
    const doc = this.getDoc()
    const active = activeAudioClipsAt(doc, ticks)
    const activeTrackIds = new Set(active.map(({ track }) => track.id))

    for (const [trackId, state] of this.audioByTrack) {
      if (!activeTrackIds.has(trackId)) state.el.pause()
    }

    for (const { track, clip } of active) {
      const asset = doc.assets.find((a) => a.id === clip.assetId)
      if (!asset) continue
      const url = await ensureObjectUrl(asset.blobKey)
      let state = this.audioByTrack.get(track.id)
      if (!state || state.url !== url) {
        state?.el.pause()
        state = { el: new Audio(url), url, clipId: null }
        this.audioByTrack.set(track.id, state)
      }
      const srcSec = ticksToSeconds(clip.in + (ticks - clip.timelineStart), doc.sequence.frameRate)
      if (state.clipId !== clip.id || Math.abs(state.el.currentTime - srcSec) > 0.25) {
        state.el.currentTime = srcSec
        state.clipId = clip.id
      }
      if (this.isPlaying() && state.el.paused) {
        void state.el.play().catch(() => {})
      }
    }
  }

  private pauseAllAudio(): void {
    for (const state of this.audioByTrack.values()) state.el.pause()
  }

  start(): void {
    if (this.raf) return
    const loop = async (now: number) => {
      this.raf = requestAnimationFrame(loop)
      if (!this.isPlaying()) {
        // Force a resync next time playback starts, however long from now that is.
        this.lastSetTicks = -1
        this.pausePlayingVideo()
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
        await this.paintPlaying(current)
        await this.syncAudio(current)
        return
      }
      const doc = this.getDoc()
      const elapsedSec = (now - this.anchorTime) / 1000
      let next = this.anchorTicks + Math.round(elapsedSec * doc.sequence.frameRate)
      // Stop at the last real frame of content, not sequence.durationTicks — that
      // also carries a couple seconds of editing buffer past the last clip so you
      // can drag clips further right, which isn't meant to be "played through".
      const end = Math.max(computeContentEnd(doc), 1)
      if (next >= end) {
        next = end
        this.setPlaying(false)
        this.pauseAllAudio()
        this.pausePlayingVideo()
        if (next === current) return
        this.lastSetTicks = next
        this.setPlayhead(next)
        await this.paint(next) // exact final frame, worth the one real seek
        await this.syncAudio(next)
        return
      }
      if (next === current) return
      this.lastSetTicks = next
      this.setPlayhead(next)
      await this.paintPlaying(next)
      await this.syncAudio(next)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stopAudio(): void {
    this.pauseAllAudio()
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.pauseAllAudio()
    this.audioByTrack.clear()
    this.pausePlayingVideo()
  }
}
