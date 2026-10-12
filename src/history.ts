import { useState } from 'react'
import type { RomProject } from './core/rom'

// Undo and redo. Every edit produces a new project object and leaves the old
// one untouched, so remembering earlier states costs almost nothing.

const LIMIT = 200
// Edits closer together than this count as one step, so that typing a name
// is undone as a whole and not a letter at a time.
const MERGE_MS = 700

interface History {
  entries: RomProject[]
  index: number
  editedAt: number
}

const EMPTY: History = { entries: [], index: -1, editedAt: 0 }

export function useProjectHistory() {
  const [history, setHistory] = useState(EMPTY)
  const project: RomProject | null = history.entries[history.index] ?? null

  return {
    project,
    canUndo: history.index > 0,
    canRedo: history.index < history.entries.length - 1,

    // Starts afresh with a newly opened project.
    reset(opened: RomProject) {
      setHistory({ entries: [opened], index: 0, editedAt: 0 })
    },

    change(next: RomProject | ((current: RomProject) => RomProject)) {
      setHistory((h) => {
        const current = h.entries[h.index]
        if (!current) return h
        const value = typeof next === 'function' ? next(current) : next
        if (value === current) return h
        const now = Date.now()
        const atEnd = h.index === h.entries.length - 1
        const merge = atEnd && h.index > 0 && now - h.editedAt < MERGE_MS
        const kept = h.entries.slice(0, merge ? h.index : h.index + 1)
        const entries = [...kept, value].slice(-LIMIT)
        return { entries, index: entries.length - 1, editedAt: now }
      })
    },

    undo() {
      setHistory((h) => (h.index > 0 ? { ...h, index: h.index - 1, editedAt: 0 } : h))
    },

    redo() {
      setHistory((h) => (h.index < h.entries.length - 1 ? { ...h, index: h.index + 1, editedAt: 0 } : h))
    },
  }
}
