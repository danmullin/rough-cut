import type { ProjectDocument } from '../types'
import { ticksToSeconds } from '../types'
import { topVideoClipAt } from '../store/document'
import { getVideoElement, seekVideo } from './assetCache'

function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  fallbackWidth: number,
  fallbackHeight: number,
  width: number,
  height: number,
  timestampSec: number,
): void {
  const vw = video.videoWidth || fallbackWidth
  const vh = video.videoHeight || fallbackHeight
  const scale = Math.min(width / vw, height / vh)
  const dw = vw * scale
  const dh = vh * scale
  const dx = (width - dw) / 2
  const dy = (height - dh) / 2

  // WebCodecs VideoFrame when available (same frame type export encodes)
  if (typeof VideoFrame !== 'undefined') {
    const frame = new VideoFrame(video, {
      timestamp: Math.round(timestampSec * 1_000_000),
    })
    try {
      ctx.drawImage(frame, dx, dy, dw, dh)
    } finally {
      frame.close()
    }
    return
  }
  ctx.drawImage(video, dx, dy, dw, dh)
}

/**
 * Draw the exact program frame at `ticks` into `ctx` (sequence pixel size).
 * Always seeks first, so the drawn frame is guaranteed correct for the
 * requested tick — right for paused/scrub use, where every request must be
 * exact, but too slow to call once per frame during continuous playback
 * (see `composeFrameLive`).
 */
export async function composeFrame(
  doc: ProjectDocument,
  ticks: number,
  ctx: CanvasRenderingContext2D,
): Promise<void> {
  const { width, height, frameRate } = doc.sequence
  ctx.fillStyle = '#05070c'
  ctx.fillRect(0, 0, width, height)

  const hit = topVideoClipAt(doc, ticks)
  if (!hit) return
  const { clip } = hit
  const asset = doc.assets.find((a) => a.id === clip.assetId)
  if (!asset || asset.kind !== 'video') return

  const video = await getVideoElement(asset.blobKey)
  const srcTicks = clip.in + (ticks - clip.timelineStart)
  const srcSec = ticksToSeconds(srcTicks, frameRate)
  await seekVideo(video, srcSec)
  drawVideoFrame(ctx, video, asset.width, asset.height, width, height, srcSec)
}

export interface LiveComposeResult {
  clipId: string | null
  video: HTMLVideoElement | null
}

/**
 * Composes a frame for continuous playback by letting the video's own
 * decoder run forward natively — matching how audio already plays here —
 * instead of seeking to an exact target every tick.
 *
 * Real footage typically keyframes once every second or so; a seek to an
 * arbitrary target forces the decoder to restart from the nearest keyframe
 * and decode forward to get there. Doing that on *every* animation frame
 * needs the decoder to run many times faster than real-time just to keep
 * up, which is why frames were dropping. So instead: seek once when the
 * active clip changes (or if drift from the expected position gets large
 * enough to notice), call `video.play()`, and otherwise just draw whatever
 * frame the decoder is naturally showing.
 */
export async function composeFrameLive(
  doc: ProjectDocument,
  ticks: number,
  ctx: CanvasRenderingContext2D,
  activeClipId: string | null,
): Promise<LiveComposeResult> {
  const { width, height, frameRate } = doc.sequence
  ctx.fillStyle = '#05070c'
  ctx.fillRect(0, 0, width, height)

  const hit = topVideoClipAt(doc, ticks)
  const clip = hit?.clip ?? null
  if (!clip) return { clipId: null, video: null }
  const asset = doc.assets.find((a) => a.id === clip.assetId)
  if (!asset || asset.kind !== 'video') return { clipId: null, video: null }

  const video = await getVideoElement(asset.blobKey)
  const srcTicks = clip.in + (ticks - clip.timelineStart)
  const srcSec = ticksToSeconds(srcTicks, frameRate)

  const changedClip = activeClipId !== clip.id
  if (changedClip || Math.abs(video.currentTime - srcSec) > 0.15) {
    await seekVideo(video, srcSec)
  }
  if (video.paused) void video.play().catch(() => {})

  drawVideoFrame(ctx, video, asset.width, asset.height, width, height, video.currentTime)
  return { clipId: clip.id, video }
}
