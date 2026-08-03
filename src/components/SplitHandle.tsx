import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'

type Orientation = 'vertical' | 'horizontal'

type Props = {
  orientation: Orientation
  /** Called with pointer position and the split parent’s bounding rect. */
  onDrag: (clientPos: number, parentRect: DOMRect) => void
  'aria-label'?: string
}

/**
 * Synth playground–style resize handle (pointer drag).
 * Parent must be `position: relative` (or the nearest sized ancestor) for rect math —
 * we measure `parentElement` of the handle.
 */
export function SplitHandle({ orientation, onDrag, 'aria-label': ariaLabel }: Props) {
  const dragging = useRef(false)

  const end = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    document.body.classList.remove('is-resizing', `is-resizing-${orientation}`)
  }, [orientation])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.classList.add('is-resizing', `is-resizing-${orientation}`)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const parent = e.currentTarget.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const pos = orientation === 'vertical' ? e.clientX : e.clientY
    onDrag(pos, rect)
  }

  return (
    <div
      className={`split-handle split-${orientation}`}
      role="separator"
      aria-orientation={orientation}
      aria-label={ariaLabel ?? (orientation === 'vertical' ? 'Resize panes' : 'Resize preview')}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    />
  )
}
