import { getMediaBlob } from '../io/mediaDb'

const urlCache = new Map<string, string>()
const videoCache = new Map<string, HTMLVideoElement>()
const videoLoads = new Map<string, Promise<HTMLVideoElement>>()

export async function ensureObjectUrl(blobKey: string): Promise<string> {
  const hit = urlCache.get(blobKey)
  if (hit) return hit
  const blob = await getMediaBlob(blobKey)
  if (!blob) throw new Error(`Missing media blob: ${blobKey}`)
  const url = URL.createObjectURL(blob)
  urlCache.set(blobKey, url)
  return url
}

export async function getVideoElement(blobKey: string): Promise<HTMLVideoElement> {
  const hit = videoCache.get(blobKey)
  if (hit) return hit
  // Memoize the in-flight load too — overlapping scrub calls during a clip's
  // first load (e.g. right after import) would otherwise each spin up their
  // own <video> element for the same blob before any of them finish.
  const inFlight = videoLoads.get(blobKey)
  if (inFlight) return inFlight
  const promise = (async () => {
    const url = await ensureObjectUrl(blobKey)
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.src = url
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('Video failed to load'))
    })
    videoCache.set(blobKey, video)
    return video
  })()
  videoLoads.set(blobKey, promise)
  try {
    return await promise
  } finally {
    videoLoads.delete(blobKey)
  }
}

export function revokeAllObjectUrls(): void {
  for (const url of urlCache.values()) URL.revokeObjectURL(url)
  urlCache.clear()
  videoCache.clear()
  videoLoads.clear()
}

/**
 * Seeks toward `timeSec`. Deliberately does NOT gate overlapping calls behind
 * a single shared in-flight promise — that was tried (twice) and both times
 * throttled throughput to the browser's real seek latency, since no new seek
 * could even start until the previous one's `seeked` fully fired. During fast
 * scrubbing or continuous playback that latency alone drops frames.
 *
 * Instead, every call just writes `currentTime` immediately and awaits its
 * own `seeked`. The browser already coalesces rapid `currentTime` writes
 * internally (only the most recent one before the previous seek settles
 * actually takes effect) and fires one `seeked` that every still-attached
 * listener receives — so stale/superseded calls resolve alongside the
 * latest one instead of blocking it, and `composeFrame` always draws
 * whatever the video is actually showing at that moment, not a stale target.
 */
export async function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  const t = Math.max(0, Math.min(timeSec, (video.duration || 0) - 0.001))
  if (Math.abs(video.currentTime - t) < 0.001) return
  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      reject(new Error('Seek failed'))
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    try {
      video.currentTime = t
    } catch (e) {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      reject(e)
    }
  })
}
