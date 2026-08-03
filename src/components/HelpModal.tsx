import { FEATURES } from '../data/features'
import { useDocStore } from '../store/documentStore'

export function HelpModal() {
  const open = useDocStore((s) => s.helpOpen)
  const setHelpOpen = useDocStore((s) => s.setHelpOpen)
  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={() => setHelpOpen(false)}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="help-title">Rough Cut — shortcuts</h2>
          <button type="button" className="ghost-btn" onClick={() => setHelpOpen(false)}>
            Close
          </button>
        </header>
        <div className="modal-body help-body">
          {FEATURES.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item.name}>
                    <span className="help-name">{item.name}</span>
                    {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
                    {item.note ? <span className="help-note">{item.note}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
