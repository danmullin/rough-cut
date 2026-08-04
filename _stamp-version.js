/**
 * Stamp date + short git SHA into public/version.json.
 * Codename is hand-edited when a chapter starts (currently: Pulsar).
 *
 * Local:  node _stamp-version.js
 * CI:     runs before the build step in deploy-pages.yml (GITHUB_SHA)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const root = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(root, 'public', 'version.json')
const version = JSON.parse(fs.readFileSync(file, 'utf8'))

version.name = version.name || 'Rough Cut'
version.codename = version.codename || 'Pulsar'

const fullSha =
  process.env.GITHUB_SHA ||
  execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
version.sha = String(fullSha).slice(0, 7)

const iso = new Date().toISOString().slice(0, 10)
version.date = iso

fs.writeFileSync(file, `${JSON.stringify(version, null, 2)}\n`)
console.log(
  `Stamped ${version.name} "${version.codename}" — ${version.date} · ${version.sha}`,
)
