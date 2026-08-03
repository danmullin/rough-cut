import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const features = JSON.parse(
  fs.readFileSync(path.join(root, 'src/data/features.json'), 'utf8'),
)
const readmePath = path.join(root, 'README.md')
let readme = fs.readFileSync(readmePath, 'utf8')

const lines = ['## Features & shortcuts', '']
for (const group of features) {
  lines.push(`### ${group.title}`, '')
  for (const item of group.items) {
    const sc = item.shortcut ? ` — \`${item.shortcut}\`` : ''
    const note = item.note ? ` — ${item.note}` : ''
    lines.push(`- **${item.name}**${sc}${note}`)
  }
  lines.push('')
}
const block = lines.join('\n')

const start = '<!-- FEATURES:START -->'
const end = '<!-- FEATURES:END -->'
if (readme.includes(start) && readme.includes(end)) {
  readme = readme.replace(
    new RegExp(`${start}[\\s\\S]*?${end}`),
    `${start}\n${block}\n${end}`,
  )
} else {
  readme = `${readme.trim()}\n\n${start}\n${block}\n${end}\n`
}

fs.writeFileSync(readmePath, readme)
console.log('Synced features into README.md')
