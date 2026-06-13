import { useState } from 'react'
import type { TimeFilter } from '@/types'

export function useChartFilter(globalFilter: TimeFilter) {
  const [synced, setSynced] = useState(true)
  const [localFilter, setLocalFilter] = useState<TimeFilter>(globalFilter)

  const effectiveFilter = synced ? globalFilter : localFilter

  function toggleSync() {
    if (synced) {
      setLocalFilter(globalFilter)
      setSynced(false)
    } else {
      setSynced(true)
    }
  }

  function setFilter(f: TimeFilter) {
    setLocalFilter(f)
    setSynced(false)
  }

  return { synced, effectiveFilter, setFilter, toggleSync }
}
