import { useState } from 'react'
import { DEFAULT_LINE_OPTIONS, HAND_SIDES, type HandSide, type LineBuilderOptions } from './core/linebuilder'

const KEY = 'nose4web.lineBuilder'

function load(): LineBuilderOptions {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<LineBuilderOptions> | null
    const valid = (side: unknown): side is HandSide => HAND_SIDES.some((s) => s.value === side)
    return {
      wings: valid(saved?.wings) ? saved.wings : DEFAULT_LINE_OPTIONS.wings,
      defence: valid(saved?.defence) ? saved.defence : DEFAULT_LINE_OPTIONS.defence,
    }
  } catch {
    return DEFAULT_LINE_OPTIONS
  }
}

// The line builder's choices, kept in this browser between visits.
export function useLineOptions(): [LineBuilderOptions, (next: LineBuilderOptions) => void] {
  const [options, setOptions] = useState(load)
  const set = (next: LineBuilderOptions) => {
    setOptions(next)
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Not kept; the choice still holds while the page is open.
    }
  }
  return [options, set]
}
