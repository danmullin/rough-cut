export interface MediaCapabilities {
  webCodecsVideoDecode: boolean
  webCodecsAudioDecode: boolean
  webCodecsEncode: boolean
  videoFrame: boolean
  fileSystemAccess: boolean
}

/** Pure feature detection — no UA sniffing. WebCodecs shipped in Firefox 130+, not just Chromium. */
export function detectCapabilities(): MediaCapabilities {
  return {
    webCodecsVideoDecode: typeof VideoDecoder !== 'undefined',
    webCodecsAudioDecode: typeof AudioDecoder !== 'undefined',
    webCodecsEncode: typeof VideoEncoder !== 'undefined',
    videoFrame: typeof VideoFrame !== 'undefined',
    fileSystemAccess: typeof (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function',
  }
}

export function exportSupported(): boolean {
  const c = detectCapabilities()
  return c.webCodecsEncode && c.videoFrame
}

// ─── H.264 profile/level negotiation ────────────────────────────────────────
// Browsers differ in which avc1 profile/level strings they'll accept, and a
// level that's fine at 720p30 can be rejected (or silently corrupt) at higher
// resolutions/frame rates. Rather than hardcode one string, probe a small
// ladder of levels via VideoEncoder.isConfigSupported and use the first hit.

const AVC_LEVELS: { level: string; maxMacroblocksPerSec: number; maxMacroblocks: number }[] = [
  { level: '1f', maxMacroblocksPerSec: 108_000, maxMacroblocks: 3_600 }, // 3.1 — up to 720p30
  { level: '20', maxMacroblocksPerSec: 216_000, maxMacroblocks: 5_120 }, // 3.2
  { level: '28', maxMacroblocksPerSec: 245_760, maxMacroblocks: 8_192 }, // 4.0 — up to 1080p30
  { level: '29', maxMacroblocksPerSec: 245_760, maxMacroblocks: 8_192 }, // 4.1
  { level: '32', maxMacroblocksPerSec: 589_824, maxMacroblocks: 22_080 }, // 5.0
  { level: '33', maxMacroblocksPerSec: 983_040, maxMacroblocks: 36_864 }, // 5.1 — up to 4K30
]

export interface ResolvedVideoEncoderConfig {
  codec: string
  config: VideoEncoderConfig
}

let cached: Promise<ResolvedVideoEncoderConfig | null> | null = null

/** Probe real support instead of assuming — picks the lowest level that fits, else the highest available. */
export async function resolveVideoEncoderConfig(
  width: number,
  height: number,
  frameRate: number,
  bitrate: number,
): Promise<ResolvedVideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined') return null
  if (cached) return cached

  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16)
  const macroblocksPerSec = macroblocks * frameRate

  cached = (async () => {
    const candidates = AVC_LEVELS.filter(
      (l) => l.maxMacroblocks >= macroblocks && l.maxMacroblocksPerSec >= macroblocksPerSec,
    )
    const ordered = candidates.length ? candidates : AVC_LEVELS
    for (const { level } of ordered) {
      const codec = `avc1.4200${level}`
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: frameRate,
        avc: { format: 'avc' },
      }
      try {
        const support = await VideoEncoder.isConfigSupported(config)
        if (support.supported) return { codec, config }
      } catch {
        /* try next */
      }
    }
    return null
  })()

  return cached
}
