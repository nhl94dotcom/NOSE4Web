import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyBulk } from '../src/core/bulk'
import { openRom, type RomProject } from '../src/core/rom'
import { goalieCount } from '../src/core/team'
import { BULK_START, bulkSetup, keptSides, NO_PAGE_WORK, tradeKept, workLeft } from '../src/pagedrafts'
import { ALL_PARTS } from '../src/core/importteam'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))
const hasRom = existsSync(romPath)
const setup = () => openRom(new Uint8Array(readFileSync(romPath)))

const ANAHEIM = 0
const BOSTON = 1

describe('work kept on Bulk changes, Trade and Import a team', () => {
  it('nothing kept, nothing left', () => {
    expect(workLeft({} as RomProject, NO_PAGE_WORK)).toEqual([])
  })

  it.skipIf(!hasRom)('Bulk changes: counts only once the form is changed, and not once applied', () => {
    const project = setup()
    const form = { ...BULK_START, team: BOSTON }
    expect(workLeft(project, { ...NO_PAGE_WORK, bulk: { form, touched: false } })).toEqual([])
    const [left] = workLeft(project, { ...NO_PAGE_WORK, bulk: { form, touched: true } })
    expect(left.page).toBe('bulk')
    expect(left.text).toMatch(/Bulk changes has a change for \d+ players set up but not applied\./)
    // Set to the most it can be, applied: nobody would change again.
    const most = { ...form, action: 'set' as const, amount: bulkSetup(project, { ...form, action: 'set' }).values.at(-1)!.value }
    const done = applyBulk(project, bulkSetup(project, most).change)
    expect(workLeft(done, { ...NO_PAGE_WORK, bulk: { form: most, touched: true } })).toEqual([])
  })

  it.skipIf(!hasRom)('Trade: a tick whose player is no longer in that place is dropped', () => {
    const project = setup()
    const first = goalieCount(project.teams[BOSTON])
    const kept = tradeKept(project, [
      { team: BOSTON, picks: [first, first + 1] },
      { team: ANAHEIM, picks: [] },
    ])
    expect(workLeft(project, { ...NO_PAGE_WORK, trade: kept })[0].text).toBe('Trade has 2 players ticked, but the trade is not made.')
    // Another page takes Boston's first skater off the roster: the others move up a place.
    const players = project.teams[BOSTON].players.filter((_, i) => i !== first)
    const changed = { ...project, teams: project.teams.map((t, i) => (i === BOSTON ? { ...t, players } : t)) }
    expect(keptSides(changed, kept)[0].picks).toEqual([])
    expect(workLeft(changed, { ...NO_PAGE_WORK, trade: kept })).toEqual([])
  })

  it.skipIf(!hasRom)('Import a team: counts once another ROM is opened, until the import is made', () => {
    const project = setup()
    const importTeam = { fileName: 'other.bin', other: project, from: BOSTON, to: ANAHEIM, parts: ALL_PARTS, dirty: true }
    const [left] = workLeft(project, { ...NO_PAGE_WORK, importTeam })
    expect(left.page).toBe('importTeam')
    expect(left.text).toMatch(/^Import a team has .+ from other\.bin chosen to replace .+, but not imported\.$/)
    expect(workLeft(project, { ...NO_PAGE_WORK, importTeam: { ...importTeam, dirty: false } })).toEqual([])
    const none = Object.fromEntries(Object.keys(ALL_PARTS).map((k) => [k, false])) as typeof ALL_PARTS
    expect(workLeft(project, { ...NO_PAGE_WORK, importTeam: { ...importTeam, parts: none } })).toEqual([])
  })
})
