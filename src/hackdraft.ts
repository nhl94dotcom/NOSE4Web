import type { RomProject } from './core/rom'
import { applyHacks, detectHacks, type HackChoices } from './core/hacks'
import { applyNhl95Hacks, detectNhl95Hacks, NO_NHL95_HACKS, nhl95HacksSupported, type Nhl95HackChoices } from './core/nhl95hacks'
import {
  applySnesHacks,
  detectSnesHacks,
  SNES_AMOUNT_OFF,
  SNES_AMOUNTS,
  withSnesHackChoice,
  type SnesAmount,
  type SnesHack,
  type SnesHackChoices,
} from './core/sneshacks'

// Choices made on a Hacks page and not applied yet. The app keeps them (they stay while other pages are looked at,
// and the page starts from them when it comes back), says so on every other page, and asks before a download.
// `base` is what the ROM had when they were made, so they can be laid on the ROM as it is now (layOnNhl94 and the rest): another
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

// The choices a draft changed from its base.
function carried(base: object | undefined, wanted: object | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!base || !wanted) return out
  const was = base as Record<string, unknown>
  for (const [key, value] of Object.entries(wanted)) if (!same(value, was[key])) out[key] = value
  return out
}

// The rules each page's own choosing keeps, for choices laid on a ROM that has changed underneath them.
// NHL 94: Ron Barr picks one way or the other; smozROM's "Edit Lines matches players" with 0 to 15 ratings is not
// made; no fight momentum without fighting.
export function nhl94Rules(now: HackChoices, next: HackChoices, change: Partial<HackChoices>): HackChoices {
  const out = { ...next, ...(change.barrPick ? { barrCoin: false } : change.barrCoin ? { barrPick: false } : {}) }
  if (out.fighting === 'none') out.fightMomentum = false
  // Without the injury risk from knockdowns its most is not written, so it stays as the ROM has it.
  if (out.injuryBonus === 0) out.injuryCap = now.injuryCap
  const suspect = out.wideRatings && out.bonuses === 'linesMatchPlayers' && !(now.wideRatings && now.bonuses === 'linesMatchPlayers')
  return suspect ? { ...out, bonuses: 'original' } : out
}
// NHL '95: what one choice turns off with it.
export function nhl95Rules(change: Partial<Nhl95HackChoices>): Partial<Nhl95HackChoices> {
  const others: Partial<Nhl95HackChoices> = {}
  // The three ways of settling a tie exclude each other: one on turns the others off.
  const ties = ['seasonOvertime', 'seasonShootout', 'seasonShootoutNow'] as const
  for (const tie of ties) if (change[tie]) for (const other of ties) if (other !== tie) others[other] = false
  // The two 3 on 3 choices exclude each other.
  if (change.threeOnThree) others.threeOnThreeAll = false
  if (change.threeOnThreeAll) others.threeOnThree = false
  // Without fighting, its setting at power-on goes back to On, and there are no fights to win.
  if (change.fighting === false) Object.assign(others, { fightingOff: false, fightingArcade: false, fightMomentum: false })
  // Without the body fix no shot hits a skater's body, so there are no blocks to count.
  if (change.bodyBlockFix === false) others.blockedShots = false
  // Without the injury risk from knockdowns its most is not kept: it goes back to what the ROM then reads.
  if (change.injuryBonus === 0) others.injuryCap = NO_NHL95_HACKS.injuryCap
  return others
}
// SNES: an amount follows its choice: off where the choice is off.
export function snesAmountsFor(choices: SnesHackChoices, amounts: Record<SnesAmount, number>): Record<SnesAmount, number> {
  return Object.fromEntries(SNES_AMOUNTS.map((h) => [h, choices[h] ? amounts[h] : SNES_AMOUNT_OFF[h]])) as Record<SnesAmount, number>
}

// A draft laid on the ROM's choices as they are now, through each page's rules.
export function layOnNhl94(now: HackChoices, draft: Pick<HackDraft, 'base' | 'wanted'> | null | undefined): HackChoices {
  const change = carried(draft?.base, draft?.wanted) as Partial<HackChoices>
  return Object.keys(change).length ? nhl94Rules(now, { ...now, ...change }, change) : now
}
export function layOnNhl95(now: Nhl95HackChoices, draft: Pick<HackDraft, 'base' | 'wanted'> | null | undefined): Nhl95HackChoices {
  const change = carried(draft?.base, draft?.wanted) as Partial<Nhl95HackChoices>
  return Object.keys(change).length ? { ...now, ...nhl95Rules(change), ...change } : now
}
export function layOnSnes(
  now: SnesHackChoices,
  nowAmounts: Record<SnesAmount, number>,
  draft: Omit<HackDraft, 'count'> | null | undefined,
): { choices: SnesHackChoices; amounts: Record<SnesAmount, number> } {
  const change = carried(draft?.base, draft?.wanted) as Partial<SnesHackChoices>
  const amountChange = carried(draft?.baseAmounts, draft?.amounts) as Partial<Record<SnesAmount, number>>
  if (!Object.keys(change).length && !Object.keys(amountChange).length) return { choices: now, amounts: nowAmounts }
  let choices = now
  for (const [hack, on] of Object.entries(change) as [SnesHack, boolean][]) if (hack in now) choices = withSnesHackChoice(choices, hack, on)
  return { choices, amounts: snesAmountsFor(choices, { ...nowAmounts, ...amountChange }) }
}

// Puts a kept draft in, as the page's Apply would (for a download made from another page). Throws where it cannot.
export function applyHackDraft(project: RomProject, draft: HackDraft): RomProject {
  if (nhl95HacksSupported(project.game)) return applyNhl95Hacks(project, layOnNhl95(detectNhl95Hacks(project.bytes).choices, draft))
  if (project.game.platform === 'snes') {
    const state = detectSnesHacks(project.bytes)
    const laid = layOnSnes(state.choices, state.amounts ?? SNES_AMOUNT_OFF, draft)
    return applySnesHacks(project, laid.choices, false, laid.amounts)
  }
  return applyHacks(project, layOnNhl94(detectHacks(project.bytes).choices, draft))
}

// Whether a kept draft still changes anything on the ROM as it is now (Undo or another page may have made it so).
export function draftLeft(project: RomProject, draft: HackDraft | null): boolean {
  if (!draft) return false
  if (nhl95HacksSupported(project.game)) {
    const now = detectNhl95Hacks(project.bytes).choices
    return !same(layOnNhl95(now, draft), now)
  }
  if (project.game.platform === 'snes') {
    const state = detectSnesHacks(project.bytes)
    const nowAmounts = state.amounts ?? SNES_AMOUNT_OFF
    const laid = layOnSnes(state.choices, nowAmounts, draft)
    return !same(laid.choices, state.choices) || !same(laid.amounts, nowAmounts)
  }
  const now = detectHacks(project.bytes).choices
  return !same(layOnNhl94(now, draft), now)
}

export const changesText = (count: number) => (count === 1 ? '1 change' : `${count} changes`)
