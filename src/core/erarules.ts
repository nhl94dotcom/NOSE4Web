import { detectHacks, HACK_TITLES, hacksSupported, type HackChoices } from './hacks'
import { detectNhl95Hacks, NHL95_HACK_TITLES, nhl95HacksSupported, type Nhl95HackChoices } from './nhl95hacks'
import type { RomProject } from './rom'
import { detectSnesHacks, SNES_AMOUNT_OFF, SNES_HACK_TITLES, withSnesHackChoice, type SnesAmount, type SnesHack } from './sneshacks'

// How the NHL settled a tied regular-season game in a season, by the year it started. The playoffs have always played
// overtime until a goal, 5 on 5, as the games do.
//   to 1982-83: no overtime, a tie
//   1983-84 to 1998-99: 5:00 of overtime, 5 on 5, then a tie
//   1999-2000 to 2003-04: 5:00 of overtime, 4 on 4, then a tie
//   2005-06 to 2014-15: 5:00 of overtime, 4 on 4, then a three-round shootout
//   2015-16 on: 5:00 of overtime, 3 on 3, then a three-round shootout
export interface EraRules {
  shootout: boolean
  threeOnThree: boolean
  // What the NHL played, and where the game plays it otherwise.
  texts: string[]
}

export function eraRules(seasonId: string): EraRules {
  const year = Number(seasonId.slice(0, 4))
  const season = `${year}-${String((year + 1) % 100).padStart(2, '0')}`
  if (year < 1983)
    return {
      shootout: false,
      threeOnThree: false,
      texts: [`In ${season} a tied regular-season game ended in a tie, with no overtime. The game always plays an overtime first, so here a game still tied after it ends in a tie.`],
    }
  if (year < 1999) return { shootout: false, threeOnThree: false, texts: [`In ${season} a tied regular-season game played an overtime, 5 on 5, and then ended in a tie.`] }
  if (year < 2005)
    return {
      shootout: false,
      threeOnThree: false,
      texts: [`In ${season} a tied regular-season game played an overtime, 4 on 4, and then ended in a tie. The game has no 4 on 4 overtime, so here it is 5 on 5.`],
    }
  if (year < 2015)
    return {
      shootout: true,
      threeOnThree: false,
      texts: [
        `In ${season} a tied regular-season game played an overtime, 4 on 4, and then a three-round shootout. The game has no 4 on 4 overtime, so here it is 5 on 5.`,
      ],
    }
  return { shootout: true, threeOnThree: true, texts: [`In ${season} a tied regular-season game played an overtime, 3 on 3, and then a three-round shootout.`] }
}

// The Hacks page choices that play a season's rules, as a draft of the page's (base: the ROM's choices now; wanted:
// with the rules), to put in as the page's Apply would (applyHackDraft). Choices the ROM has changed code for are left
// out and named (by their titles) in `skipped`; null where the ROM takes no hacks.
export interface EraDraft {
  base: object
  wanted: object
  baseAmounts?: object
  amounts?: object
  count: number
  skipped: string[]
}

const changed = (base: object, wanted: object) =>
  Object.entries(wanted).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify((base as Record<string, unknown>)[key])).length

export function eraDraft(project: RomProject, rules: EraRules): EraDraft | null {
  if (nhl95HacksSupported(project.game)) {
    const { choices, unknown } = detectNhl95Hacks(project.bytes)
    const want: Partial<Nhl95HackChoices> = {
      seasonOvertime: false,
      seasonShootout: rules.shootout,
      seasonShootoutNow: false,
      threeOnThree: rules.threeOnThree,
      threeOnThreeAll: false,
      ...(rules.shootout ? { nhlShootout: true } : {}),
    }
    const skipped = (Object.keys(want) as (keyof Nhl95HackChoices)[]).filter((k) => unknown.includes(k as never))
    for (const k of skipped) delete want[k]
    const wanted = { ...choices, ...want }
    return { base: choices, wanted, count: changed(choices, wanted), skipped: skipped.map((k) => NHL95_HACK_TITLES[k]) }
  }
  if (project.game.platform === 'snes') {
    const { choices, unknown, amounts = SNES_AMOUNT_OFF, notOffered = {} } = detectSnesHacks(project.bytes)
    const skipped: string[] = []
    let next = choices
    const nextAmounts: Record<SnesAmount, number> = { ...amounts }
    const set = (hack: SnesHack, on: boolean, amount?: number) => {
      // Never changed: code the ROM has changed, or a build's own version of it (off, and not to be put in).
      if (unknown.includes(hack) || notOffered[hack] !== undefined) {
        if (on || choices[hack]) skipped.push(SNES_HACK_TITLES[hack])
        return
      }
      next = withSnesHackChoice(next, hack, on)
      if (amount !== undefined) nextAmounts[hack as SnesAmount] = on ? amount : SNES_AMOUNT_OFF[hack as SnesAmount]
    }
    set('seasonOvertime', false)
    set('seasonShootout', rules.shootout, 1)
    set('threeOnThree', rules.threeOnThree, 1)
    if (rules.shootout) set('nhlShootout', true)
    // An amount is off where its choice is (withSnesHackChoice may have turned one off with another).
    for (const hack of ['seasonShootout', 'threeOnThree'] as const) if (!next[hack]) nextAmounts[hack] = SNES_AMOUNT_OFF[hack]
    // A choice and its amount changed together count as one change.
    const count = (Object.keys(next) as SnesHack[]).filter(
      (h) => next[h] !== choices[h] || (h in nextAmounts && nextAmounts[h as SnesAmount] !== amounts[h as SnesAmount]),
    ).length
    return { base: choices, wanted: next, baseAmounts: amounts, amounts: nextAmounts, count, skipped }
  }
  if (!hacksSupported(project.game)) return null
  const { choices, unknown } = detectHacks(project.bytes)
  const want: Partial<HackChoices> = {
    seasonTies: rules.shootout ? 'shootout' : 'tie',
    threeOnThree: rules.threeOnThree ? 'season' : 'off',
    ...(rules.shootout ? { nhlShootout: true } : {}),
  }
  const skipped = (Object.keys(want) as (keyof HackChoices)[]).filter((k) => unknown.includes(k as never))
  for (const k of skipped) delete want[k]
  const wanted = { ...choices, ...want }
  return { base: choices, wanted, count: changed(choices, wanted), skipped: skipped.map((k) => HACK_TITLES[k]) }
}
