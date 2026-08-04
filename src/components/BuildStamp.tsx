import { useEffect, useState } from 'react'

type Version = { name?: string; codename?: string; date?: string; sha?: string }

/** Small, easy-to-miss build badge — codename + short SHA, full detail on hover. */
export function BuildStamp() {
  const [v, setV] = useState<Version | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: Version) => {
        if (!cancelled) setV(data)
      })
      .catch(() => {
        if (!cancelled) setV(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!v) return null
  const name = v.name || 'Rough Cut'
  const codename = v.codename || 'Pulsar'
  const sha = v.sha || 'local'
  const date = v.date || 'dev'
  const short = `${codename} · ${sha}`
  const full = `${name} "${codename}" — ${date} · ${sha}`

  return (
    <span className="build-stamp" title={full}>
      {short}
    </span>
  )
}
