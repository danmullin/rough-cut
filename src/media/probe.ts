import type { MediaAsset } from '../types'
import { newId, secondsToTicks } from '../types'
import { putMediaBlob } from '../io/mediaDb'
import { DEFAULT_FPS } from '../store/document'

function probeVideo(file: File, fps: number): Promise<Omit<MediaAsset, 'blobKey'>> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = url
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      const asset = {
        id: newId('asset'),
        name: file.name,
        kind: 'video' as const,
        durationTicks: Math.max(1, secondsToTicks(duration, fps)),
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720,
        sampleRate: 48000,
      }
      URL.revokeObjectURL(url)
      resolve(asset)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Could not read video: ${file.name}`))
    }
  })
}

function probeAudio(file: File, fps: number): Promise<Omit<MediaAsset, 'blobKey'>> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.src = url
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0
      const asset = {
        id: newId('asset'),
        name: file.name,
        kind: 'audio' as const,
        durationTicks: Math.max(1, secondsToTicks(duration, fps)),
        width: 0,
        height: 0,
        sampleRate: 48000,
      }
      URL.revokeObjectURL(url)
      resolve(asset)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Could not read audio: ${file.name}`))
    }
  })
}

export async function importMediaFile(file: File, fps = DEFAULT_FPS): Promise<MediaAsset> {
  const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg)$/i.test(file.name)
  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(file.name)
  if (!isAudio && !isVideo) {
    throw new Error('Unsupported file type — use MP4/WebM video or common audio')
  }
  const meta = isAudio && !isVideo ? await probeAudio(file, fps) : await probeVideo(file, fps)
  const blobKey = `blob_${meta.id}`
  await putMediaBlob(blobKey, file)
  return { ...meta, blobKey }
}

export function pickMediaFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'video/mp4,video/webm,video/quicktime,audio/*,.mp4,.webm,.mov,.mp3,.wav,.m4a'
    input.multiple = true
    input.onchange = () => resolve([...(input.files ?? [])])
    input.click()
  })
}
