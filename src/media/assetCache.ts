import { getMediaBlob } from '../io/mediaDb'

const urlCache = new Map<string, string>()
const videoCache = new Map<string, HTMLVideoElement>()

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
}

export function revokeAllObjectUrls(): void {
  for (const url of urlCache.values()) URL.revokeObjectURL(url)
  urlCache.clear()
  videoCache.clear()
}

export async function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  const t = Math.max(0, Math.min(timeSec, (video.duration || 0) - 0.001))
  if (Math.abs(video.currentTime - t) < 0.001) return
  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    video.onerror = () => reject(new Error('Seek failed'))
    try {
      video.currentTime = t
    } catch (e) {
      video.removeEventListener('seeked', onSeeked)
      reject(e)
    }
  })
}
