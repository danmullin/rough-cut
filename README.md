# Rough Cut

Web-based rough-cut NLE — import, cut, trim, play, export. Not Premiere; a sharp blade for a first assembly.

**Live:** https://danmullin.github.io/rough-cut/

**Tagline:** *Cut first. Polish later.*

## Run

```powershell
cd projects/rough-cut
npm install
npm run dev
```

Open the URL Vite prints (usually http://127.0.0.1:5173/).

**Playback/edit** works anywhere with `VideoDecoder` — Chrome, Edge, and Firefox 130+.
**Export** needs WebCodecs `VideoEncoder`, also shipped in Chrome, Edge, and Firefox 130+.
Native Save/Open file pickers are Chromium-only (File System Access API); Firefox falls back to download/upload, which works the same, just without overwriting the same file handle in place.

## Workflow

1. **Import** MP4 / WebM (and common audio)
2. Clips land on **V1** / **A1** (or drag from Project)
3. **Play** with Space; scrub the playhead
4. **Razor** (`C` or Ctrl+K) to split; drag edges to trim
5. **Export MP4** (Ctrl+E)

Project JSON saves edit decisions; media blobs stay in IndexedDB for the same origin.

## Stack

Vite · React 19 · TypeScript · Zustand · WebCodecs encode · `mp4-muxer`

Shell patterns borrow from [Penultimate](../vector) (chrome, undo, shortcuts, `features.json`) — document model and media pipeline are greenfield.

<!-- FEATURES:START -->
## Features & shortcuts

### Tools

- **Selection** — `V` — Select and drag clips on the timeline. Video and its embedded audio are linked (🔗) — click, drag, and delete move/remove both
- **Razor** — `C` — Split clip(s) at the playhead
- **Hand** — `H` — Pan the timeline

### Timeline

- **Play / Pause** — `Space`
- **Go to start** — `Home`
- **Go to end** — `End`
- **Step back** — `←`
- **Step forward** — `→`
- **Razor at playhead** — `Ctrl+K`
- **Delete selected clips** — `Delete / Backspace`
- **Zoom timeline** — `Ctrl+= / Ctrl+-`
- **Select clip ignoring link** — `Alt+Click` — Grab just the video or just the audio half of a linked clip
- **Add track** — `+ Video/Audio Track button` — New sequences start with 3 video + 3 audio tracks, like Premiere. Video tracks stack upward (higher wins when stacked), audio stacks downward
- **Remove track** — `× on track header` — Renumbers remaining tracks of that type; can't remove the last one

### Edit

- **Undo** — `Ctrl+Z`
- **Redo** — `Ctrl+Y / Ctrl+Shift+Z`
- **Import media** — `Ctrl+I`
- **Save project** — `Ctrl+S`
- **Open project** — `Ctrl+O`
- **Export MP4** — `Ctrl+E`

### Help

- **Keyboard shortcuts** — `?` — Opens this panel

<!-- FEATURES:END -->

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local editor |
| `npm run build` | Production build |
| `npm run preview` | Preview build |
| `npm run sync:readme` | Sync Help catalog into this README |
| `npm run lint` | oxlint |
