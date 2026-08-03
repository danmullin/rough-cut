export interface MediaCapabilities {
  webCodecsVideo: boolean
  webCodecsAudio: boolean
  webCodecsEncode: boolean
  chromiumLikely: boolean
}

export function detectCapabilities(): MediaCapabilities {
  const hasVD = typeof VideoDecoder !== 'undefined'
  const hasVE = typeof VideoEncoder !== 'undefined'
  const hasAD = typeof AudioDecoder !== 'undefined'
  const ua = navigator.userAgent
  const chromiumLikely = /Chrome|Edg|Chromium/i.test(ua) && !/OPR|Opera/i.test(ua)

  return {
    webCodecsVideo: hasVD,
    webCodecsAudio: hasAD,
    webCodecsEncode: hasVE,
    chromiumLikely,
  }
}

export function exportSupported(): boolean {
  const c = detectCapabilities()
  return c.webCodecsEncode && c.webCodecsVideo
}
