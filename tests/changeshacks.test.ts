import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, NO_HACKS, withHacksOf } from '../src/core/hacks'
import { openRom, type RomProject } from '../src/core/rom'
import { changesSince, startSeason } from '../src/core/season'
import { applySnesHacks } from '../src/core/sneshacks'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
// As App.tsx: the ROM as opened, given the work's hacks so players are compared on its scales.
const opened = (bytes: Uint8Array, work: RomProject) => {
  const asOpened = { ...openRom(bytes), source: bytes }
  return withHacksOf(asOpened, { ...asOpened, bytes: work.bytes, game: work.game })
}
const hacksOf = (report: ReturnType<typeof changesSince>) => report.details.filter((s) => s.heading.startsWith('Hacks'))

describe('the Changes list shows the hacks changed', () => {
  it.skipIf(!existsSync(path('NHL94.smc')))('SNES: since the ROM was opened', () => {
    const bytes = new Uint8Array(readFileSync(path('NHL94.smc')))
    const start = { ...openRom(bytes), source: bytes }
    const work = applySnesHacks(start, { creaseIcing: true })
    expect(hacksOf(changesSince(work, opened(bytes, work)))).toEqual([{ heading: 'Hacks', changes: ['No icing within the crease: off to on.'] }])
  })

  it.skipIf(!existsSync(path('nhl94.bin')))('Genesis: since the ROM was opened', () => {
    const bytes = new Uint8Array(readFileSync(path('nhl94.bin')))
    const start = { ...openRom(bytes), source: bytes }
    const work = applyHacks(start, { ...NO_HACKS, passFix: true })
    expect(hacksOf(changesSince(work, opened(bytes, work)))).toEqual([{ heading: 'Hacks', changes: ['Rocket pass fix: off to on.'] }])
  })

  it.skipIf(!existsSync(path('NHL94.smc')))('since a season began: only what changed after it, and kept in project files', () => {
    const bytes = new Uint8Array(readFileSync(path('NHL94.smc')))
    const start = { ...openRom(bytes), source: bytes }
    // A hack before the season, then one after it.
    const season = startSeason(applySnesHacks(start, { creaseIcing: true }), 'Season_2', { clearFreeAgents: false })
    const work = applySnesHacks(season, { goaliePoke: true })
    expect(hacksOf(changesSince(work, work.baseline!))).toEqual([{ heading: 'Hacks', changes: ['Goalie poke check reaches the ice: off to on.'] }])
    // Saved and opened again, the season keeps its hacks.
    const reopened = openProjectFile({ ...openRom(bytes), source: bytes }, saveProjectFile(work, opened(bytes, work), 'Season_2')).project
    expect(reopened.baseline?.hacks?.choices.creaseIcing).toBe(true)
  })

  it.skipIf(!existsSync(path('NHL94.smc')))('a season begun before its hacks were kept: those since the ROM was opened, said so', () => {
    const bytes = new Uint8Array(readFileSync(path('NHL94.smc')))
    const start = { ...openRom(bytes), source: bytes }
    const season = startSeason(start, 'Season_2', { clearFreeAgents: false })
    const old = { ...season, baseline: { ...season.baseline!, hacks: undefined } }
    const work = applySnesHacks(old, { goaliePoke: true })
    expect(hacksOf(changesSince(work, work.baseline!))).toEqual([{ heading: 'Hacks (since the ROM was opened)', changes: ['Goalie poke check reaches the ice: off to on.'] }])
  })
})
