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

type SeekState = { pending: Promise<void> | null; latestTarget: number }
const seekStates = new WeakMap<HTMLVideoElement, SeekState>()

/**
 * Seeks toward `timeSec`, but coalesces overlapping requests: fast scrubbing
 * (or continuous playback, which calls this once per animation frame) fires
 * seeks faster than the decoder can service them, and naively setting
 * `currentTime` on every call races a pile of stale `seeked` listeners
 * against each other, resolving in unpredictable order and drawing frames
 * out of sequence. So every caller just registers "this is the latest
 * position we want" and awaits one shared in-flight seek.
 *
 * Each run is a single seek-and-settle cycle to whatever the newest target
 * is *when the cycle starts* — it does NOT loop to re-chase a target that
 * keeps moving. During playback the target advances on nearly every frame
 * and never stops moving, so a chasing loop would never exit, `pending`
 * would never clear, and every later call would await one promise that
 * resolves only once playback stops — i.e. almost nothing paints. One
 * seek per cycle keeps forward progress: whichever call is "latest" when
 * a cycle finishes kicks off the next cycle to the freshest target.
 */
export async function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  const target = Math.max(0, Math.min(timeSec, (video.duration || 0) - 0.001))
  let state = seekStates.get(video)
  if (!state) {
    state = { pending: null, latestTarget: video.currentTime }
    seekStates.set(video, state)
  }
  state.latestTarget = target
  if (state.pending) return state.pending

  const s = state
  const run = async (): Promise<void> => {
    const goal = s.latestTarget
    if (Math.abs(video.currentTime - goal) < 0.001) return
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
        video.currentTime = goal
      } catch (e) {
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onError)
        reject(e)
      }
    })
  }
  state.pending = run().finally(() => {
    state!.pending = null
  })
  return state.pending
}
