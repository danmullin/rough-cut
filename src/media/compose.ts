import type { ProjectDocument } from '../types'
import { ticksToSeconds } from '../types'
import { clipAtTime } from '../store/document'
import { getVideoElement, seekVideo } from './assetCache'

/** Draw the program frame at `ticks` into `ctx` (sequence pixel size). */
export async function composeFrame(
  doc: ProjectDocument,
  ticks: number,
  ctx: CanvasRenderingContext2D,
): Promise<void> {
  const { width, height, frameRate } = doc.sequence
  ctx.fillStyle = '#05070c'
  ctx.fillRect(0, 0, width, height)

  const vTrack = doc.tracks.find((t) => t.type === 'video')
  if (!vTrack) return
  const clip = clipAtTime(vTrack, ticks)
  if (!clip) return
  const asset = doc.assets.find((a) => a.id === clip.assetId)
  if (!asset || asset.kind !== 'video') return

  const video = await getVideoElement(asset.blobKey)
  const srcTicks = clip.in + (ticks - clip.timelineStart)
  const srcSec = ticksToSeconds(srcTicks, frameRate)
  await seekVideo(video, srcSec)

  const vw = video.videoWidth || asset.width
  const vh = video.videoHeight || asset.height
  const scale = Math.min(width / vw, height / vh)
  const dw = vw * scale
  const dh = vh * scale
  const dx = (width - dw) / 2
  const dy = (height - dh) / 2

  // WebCodecs VideoFrame when available (same frame type export encodes)
  if (typeof VideoFrame !== 'undefined') {
    const frame = new VideoFrame(video, {
      timestamp: Math.round(srcSec * 1_000_000),
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
