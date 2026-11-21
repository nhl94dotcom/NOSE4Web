import type { RomProject } from './core/rom'
import { applyHacks, detectHacks } from './core/hacks'
import { applyNhl95Hacks, detectNhl95Hacks, nhl95HacksSupported } from './core/nhl95hacks'
import { applySnesHacks, detectSnesHacks } from './core/sneshacks'

// Choices made on a Hacks page and not applied yet. The app keeps them (they stay while other pages are looked at,
// and the page starts from them when it comes back), says so on every other page, and asks before a download.
// `base` is what the ROM had when they were made, so they can be laid on the ROM as it is now (rebase): another
// page, or Undo, may have changed it since.
export interface HackDraft {
  base: object
  wanted: object
  // The SNES page's amounts, as the choices.
  baseAmounts?: object
  amounts?: object
  count: number
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

// `now` with each value the draft changed (from its base) set as the draft has it.
export function rebase<T extends object>(now: T, base: object | undefined, wanted: object | undefined): T {
  if (!base || !wanted) return now
  const out = { ...now } as Record<string, unknown>
  const was = base as Record<string, unknown>
  for (const [key, value] of Object.entries(wanted)) if (key in out && !same(value, was[key])) out[key] = value
  return out as T
}

// Puts a kept draft in, as the page's Apply would (for a download made from another page). Throws where it cannot.
export function applyHackDraft(project: RomProject, draft: HackDraft): RomProject {
  if (nhl95HacksSupported(project.game)) {
    const now = detectNhl95Hacks(project.bytes).choices
    return applyNhl95Hacks(project, rebase(now, draft.base, draft.wanted))
  }
  if (project.game.platform === 'snes') {
    const state = detectSnesHacks(project.bytes)
    const amounts = rebase(state.amounts ?? {}, draft.baseAmounts, draft.amounts)
    return applySnesHacks(project, rebase(state.choices, draft.base, draft.wanted), false, amounts as Parameters<typeof applySnesHacks>[3])
  }
  return applyHacks(project, rebase(detectHacks(project.bytes).choices, draft.base, draft.wanted))
}

export const changesText = (count: number) => (count === 1 ? '1 change' : `${count} changes`)
