import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import type { ProjectDocument } from '../types'
import { computeContentEnd } from '../store/document'
import { composeFrame } from './compose'
import { exportSupported, resolveVideoEncoderConfig } from './capabilities'

export type ExportProgress = (ratio: number, label: string) => void

export async function exportSequenceMp4(
  doc: ProjectDocument,
  onProgress?: ExportProgress,
): Promise<Blob> {
  if (!exportSupported()) {
    throw new Error('This browser is missing WebCodecs VideoEncoder — export needs a browser that supports it (Chrome, Edge, or Firefox 130+).')
  }

  const { width, height, frameRate } = doc.sequence
  const endTicks = Math.max(computeContentEnd(doc), frameRate)
  const frameCount = Math.max(1, endTicks)

  const bitrate = Math.round(Math.min(20_000_000, Math.max(2_000_000, width * height * frameRate * 0.12)))
  const resolved = await resolveVideoEncoderConfig(width, height, frameRate, bitrate)
  if (!resolved) {
    throw new Error(`This browser can't encode H.264 at ${width}×${height}@${frameRate} — try a smaller sequence.`)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: {
      codec: 'avc',
      width,
      height,
    },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  })

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error('VideoEncoder error', e),
  })

  encoder.configure(resolved.config)

  const frameDurationUs = Math.round(1_000_000 / frameRate)

  for (let i = 0; i < frameCount; i++) {
    onProgress?.(i / frameCount, `Encoding frame ${i + 1}/${frameCount}`)
    await composeFrame(doc, i, ctx)
    const frame = new VideoFrame(canvas, {
      timestamp: i * frameDurationUs,
      duration: frameDurationUs,
    })
    encoder.encode(frame, { keyFrame: i % (frameRate * 2) === 0 })
    frame.close()
    // Yield so the UI can breathe
    if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0))
  }

  await encoder.flush()
  encoder.close()
  muxer.finalize()

  onProgress?.(1, 'Done')
  return new Blob([target.buffer], { type: 'video/mp4' })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
