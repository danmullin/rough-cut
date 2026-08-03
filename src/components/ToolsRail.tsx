import type { ToolId } from '../types'
import { useDocStore } from '../store/documentStore'

const TOOLS: { id: ToolId; label: string; key: string }[] = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'razor', label: 'Razor', key: 'C' },
  { id: 'hand', label: 'Hand', key: 'H' },
]

export function ToolsRail() {
  const tool = useDocStore((s) => s.tool)
  return (
    <aside className="tools-rail" aria-label="Tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={tool === t.id ? 'tool is-active' : 'tool'}
          title={`${t.label} (${t.key})`}
          onClick={() => useDocStore.getState().setTool(t.id)}
        >
          <span className="tool-key">{t.key}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </aside>
  )
}
