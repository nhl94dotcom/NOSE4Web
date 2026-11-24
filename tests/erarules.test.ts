import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { eraDraft, eraRules } from '../src/core/erarules'
import { applyHacks, detectHacks } from '../src/core/hacks'
import { detectNhl95Hacks } from '../src/core/nhl95hacks'
import { openRom } from '../src/core/rom'
import { detectSnesHacks } from '../src/core/sneshacks'
import { applyHackDraft } from '../src/hackdraft'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const has = (name: string) => existsSync(path(name))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))

describe("a season's rules for tied games", () => {
  it('follow the NHL: ties to 2003-04, the shootout from 2005-06, 3 on 3 from 2015-16', () => {
    const rules = (id: string) => {
      const { shootout, threeOnThree } = eraRules(id)
      return { shootout, threeOnThree }
    }
    for (const id of ['19671968', '19821983', '19831984', '19981999', '19992000', '20032004']) expect(rules(id)).toEqual({ shootout: false, threeOnThree: false })
    for (const id of ['20052006', '20142015']) expect(rules(id)).toEqual({ shootout: true, threeOnThree: false })
    for (const id of ['20152016', '20242025']) expect(rules(id)).toEqual({ shootout: true, threeOnThree: true })
    expect(eraRules('19821983').texts[0]).toMatch(/^In 1982-83 .*no overtime/)
    expect(eraRules('19992000').texts[0]).toMatch(/^In 1999-00 .*4 on 4.*here it is 5 on 5/)
  })
})

describe('setting them on a ROM', () => {
  it.skipIf(!has('nhl94.bin'))('NHL 94: a shootout and 3 on 3 for 2015-16, a tie for 1992-93, and nothing left to do after', () => {
    // Overtime until a goal in every overtime, 3 on 3, to begin with.
    const rom = applyHacks(open('nhl94.bin'), { ...detectHacks(open('nhl94.bin').bytes).choices, seasonTies: 'overtime', threeOnThree: 'all' })
    const plan = eraDraft(rom, eraRules('20152016'))!
    expect(plan.count).toBe(3)
    const recent = applyHackDraft(rom, plan)
    expect(detectHacks(recent.bytes).choices).toMatchObject({ seasonTies: 'shootout', threeOnThree: 'season', nhlShootout: true })
    expect(eraDraft(recent, eraRules('20152016'))!.count).toBe(0)
    // 1992-93 ends a tie as the original game; the three-round shootout (Shootout mode's too) is left as it is.
    const old = applyHackDraft(recent, eraDraft(recent, eraRules('19921993'))!)
    expect(detectHacks(old.bytes).choices).toMatchObject({ seasonTies: 'tie', threeOnThree: 'off', nhlShootout: true })
  })

  for (const name of ['NHL94.smc', 'nhl94snes_SA1.sfc'])
    it.skipIf(!has(name))(`SNES ${name}: a shootout after one overtime and 3 on 3 in the regular season, then off again`, () => {
      const rom = open(name)
      const recent = applyHackDraft(rom, eraDraft(rom, eraRules('20202021'))!)
      const state = detectSnesHacks(recent.bytes)
      expect(state.choices).toMatchObject({ seasonOvertime: false, seasonShootout: true, threeOnThree: true, nhlShootout: true })
      expect(state.amounts).toMatchObject({ seasonShootout: 1, threeOnThree: 1 })
      expect(eraDraft(recent, eraRules('20202021'))!.count).toBe(0)
      const old = applyHackDraft(recent, eraDraft(recent, eraRules('19801981'))!)
      expect(detectSnesHacks(old.bytes).choices).toMatchObject({ seasonOvertime: false, seasonShootout: false, threeOnThree: false })
    })

  it.skipIf(!has('NHL95/NHL_95.bin'))("NHL '95: the same choices", () => {
    const rom = open('NHL95/NHL_95.bin')
    const recent = applyHackDraft(rom, eraDraft(rom, eraRules('20102011'))!)
    expect(detectNhl95Hacks(recent.bytes).choices).toMatchObject({ seasonShootout: true, seasonShootoutNow: false, seasonOvertime: false, nhlShootout: true, threeOnThree: false })
    const now = applyHackDraft(recent, eraDraft(recent, eraRules('20162017'))!)
    expect(detectNhl95Hacks(now.bytes).choices).toMatchObject({ seasonShootout: true, threeOnThree: true, threeOnThreeAll: false })
  })
})
