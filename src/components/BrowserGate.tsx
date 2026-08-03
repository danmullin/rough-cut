import { detectCapabilities } from '../media/capabilities'

export function BrowserGate() {
  const caps = detectCapabilities()
  if (caps.webCodecsEncode && caps.videoFrame) return null
  return (
    <div className="browser-gate" role="status">
      This browser doesn't support WebCodecs video encoding yet — playback and
      trimming still work, but export needs a browser with it (Chrome, Edge,
      or Firefox 130+).
    </div>
  )
}
