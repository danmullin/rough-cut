import { useCallback, useEffect, useState } from 'react'

const KEY = 'rough-cut.layout'

export type LayoutSplits = {
  leftPx: number
  rightPx: number
  /** Program monitor share of center column height (0–100). */
  monitorPct: number
}

const DEFAULTS: LayoutSplits = {
  leftPx: 240,
  rightPx: 240,
  monitorPct: 48,
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function load(): LayoutSplits {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<LayoutSplits>
    return {
      leftPx: clamp(parsed.leftPx ?? DEFAULTS.leftPx, 160, 480),
      rightPx: clamp(parsed.rightPx ?? DEFAULTS.rightPx, 160, 480),
      monitorPct: clamp(parsed.monitorPct ?? DEFAULTS.monitorPct, 22, 78),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function useLayoutSplits() {
  const [layout, setLayout] = useState<LayoutSplits>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(layout))
    } catch {
      /* ignore */
    }
  }, [layout])

  const setLeftFromClientX = useCallback((clientX: number, parentRect: DOMRect) => {
    setLayout((prev) => ({
      ...prev,
      leftPx: clamp(clientX - parentRect.left, 160, Math.min(480, parentRect.width * 0.4)),
    }))
  }, [])

  const setRightFromClientX = useCallback((clientX: number, parentRect: DOMRect) => {
    setLayout((prev) => ({
      ...prev,
      rightPx: clamp(parentRect.right - clientX, 160, Math.min(480, parentRect.width * 0.4)),
    }))
  }, [])

  const setMonitorFromClientY = useCallback((clientY: number, parentRect: DOMRect) => {
    const pct = ((clientY - parentRect.top) / parentRect.height) * 100
    setLayout((prev) => ({
      ...prev,
      monitorPct: clamp(pct, 22, 78),
    }))
  }, [])

  return {
    layout,
    setLeftFromClientX,
    setRightFromClientX,
    setMonitorFromClientY,
  }
}
