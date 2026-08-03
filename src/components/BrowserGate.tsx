import { detectCapabilities } from '../media/capabilities'

export function BrowserGate() {
  const caps = detectCapabilities()
  if (caps.webCodecsEncode && caps.chromiumLikely) return null
  return (
    <div className="browser-gate" role="status">
      {!caps.webCodecsEncode
        ? 'Export needs WebCodecs VideoEncoder — use Chrome or Edge for the full Rough Cut workflow.'
        : 'Chromium recommended for reliable decode/export. Playback may still work here.'}
    </div>
  )
}
