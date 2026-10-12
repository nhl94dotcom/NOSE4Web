import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { attributeNote, attributeText, isWeight, weightKind } from '../src/core/attributes'
import { readU16, readU32, writeAscii } from '../src/core/bytes'
import { bulkAttributes, bulkValues } from '../src/core/bulk'
import { expandTeamSpace, nextExpansion } from '../src/core/expand'
import { findGame, NHL94 } from '../src/core/games'
import { expandPictureSpace } from '../src/core/graphics'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom } from '../src/core/rom'
import { addPlayer } from '../src/core/roster'
import { claimSpace } from '../src/core/space'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const hasRom = existsSync(path('nhl94.bin'))
const stock = () => new Uint8Array(readFileSync(path('nhl94.bin')))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const hasLeague = !!local.league30Rom && existsSync(path(local.league30Rom))

// The product code's last four characters, as a hack program would mark them.
const marked = (rom: Uint8Array, marks: string) => {
  const copy = rom.slice()
  writeAscii(copy, 0x18a, marks)
  return copy
}
const none = new Uint8Array(0x200)

describe('product codes marked by hack programs', () => {
  it('reads the rating scale, the number of teams and the base weight from the code', () => {
    expect(findGame('GM T-50656 -00', none)).toBe(NHL94)
    expect(findGame('GM T-50656 -0T', none)).toBe(NHL94) // T is the original 140
    expect(findGame('GM T-50656 -30', none)?.teamCount).toBe(30)

    const retro = findGame('GM T-50656 -0A', none)!
    expect(retro.title).toBe('NHL 94, base weight 102')
    expect(retro.teamCount).toBe(28)
    expect(retro.playerAttributeKinds[0]).toBe('weight:102')
    expect(retro.playerAttributeKinds[1]).toBe('rating')
    expect(retro.overallIsEstimate).toBe(false)
    expect(findGame('GM T-50656 -3Z', none)?.playerAttributeKinds[0]).toBe('weight:152')

    const wide = findGame('GM T-50656-F3V', none)!
    expect(wide.title).toBe('NHL 94 (30 teams), 0–15 ratings, base weight 144')
    expect(wide.teamCount).toBe(30)
    expect(wide.playerAttributeKinds.slice(0, 3)).toEqual(['weight:144', 'value', 'value'])
    expect(wide.playerAttributeKinds[7]).toBe('handedFighting')
    expect(wide.goalieAttributeKinds[6]).toBe('zero') // still unused by the game
    expect(wide.overallIsEstimate).toBe(true)
    expect(wide.notice).toContain('0 to 15')
    // 0 to 15 ratings with the original weights: marked with a 0 or with a T.
    expect(findGame('GM T-50656-F00', none)?.title).toBe('NHL 94, 0–15 ratings')
    expect(findGame('GM T-50656-F0T', none)?.playerAttributeKinds[0]).toBe('weight')
    // The same code gives the same settings each time.
    expect(findGame('GM T-50656-F3V', none)).toBe(wide)
  })

  it('does not know codes outside that scheme', () => {
    for (const code of ['GM T-50656 -1A', 'GM T-50656-G0A', 'GM T-50656 -0a', 'GM T-50656 -0', 'GM T-50236 -00', '']) {
      expect(findGame(code, none), code).toBeUndefined()
    }
  })

  it('knows NHL 94: EVO by the name in its header, not by its code alone', () => {
    const header = new Uint8Array(0x200)
    writeAscii(header, 0x120, 'NHL 94: EVO by Adam Catalyst')
    expect(findGame('GM T-50656-F3V', header)?.title).toBe('NHL 94: EVO')
    expect(findGame('GM T-50656-F3V', header)?.teamCount).toBe(64)
    expect(findGame('GM T-50656-F3V', none)?.teamCount).toBe(30)
    // The name with another code is not EVO either.
    expect(findGame('GM T-50656 -30', header)?.title).toBe('NHL 94 (30 teams)')
  })

  it('shows weights from the base a ROM was set up with', () => {
    expect(attributeText('weight', 0)).toBe('140')
    expect(attributeText('weight', 6)).toBe('188')
    expect(attributeText(weightKind(144), 0)).toBe('144')
    expect(attributeText('weight:102', 15)).toBe('222')
    expect(weightKind(140)).toBe('weight')
    expect(isWeight('weight:110')).toBe(true)
    expect(isWeight('rating')).toBe(false)
    expect(attributeNote('weight:110')).toBe('pounds')
    expect(attributeNote('rating')).toBe('')
    expect(bulkValues('weight:144').map((v) => v.text).slice(0, 3)).toEqual(['144', '152', '160'])
  })

  it.skipIf(!hasRom)('opens, edits and rebuilds the original game marked for another era', () => {
    const project = openRom(marked(stock(), ' -0V'))
    expect(project.game.title).toBe('NHL 94, base weight 144')
    expect(project.teams).toHaveLength(28)
    expect(bulkAttributes(project.game, 'skaters').map((a) => a.name)).toContain('Weight')
    const rebuilt = buildRom(project)
    expect(String.fromCharCode(...rebuilt.subarray(0x180, 0x18e))).toBe('GM T-50656 -0V')
    expect(openRom(rebuilt).teams).toEqual(project.teams)
    // A project made on one kind of ROM is not opened over another.
    const plain = openRom(stock())
    expect(() => openProjectFile(plain, saveProjectFile(project, project, 'x'))).toThrow(
      'This project is for NHL 94, base weight 144, and the ROM in the editor is NHL 94.',
    )
  })

  it.skipIf(!hasRom)('opens the original game marked for 0 to 15 ratings, with every value on offer', () => {
    const project = openRom(marked(stock(), '-F0T'))
    expect(project.game.title).toBe('NHL 94, 0–15 ratings')
    const speed = bulkAttributes(project.game, 'skaters').find((a) => a.name === 'Speed')!
    expect(bulkValues(speed.kind).map((v) => v.value)).toEqual(Array.from({ length: 16 }, (_, i) => i))
    const teams = project.teams.map((team, t) =>
      t === 3 ? { ...team, players: team.players.map((p, i) => (i === 5 ? { ...p, attributes: p.attributes.map((v, a) => (a === 2 ? 15 : v)) } : p)) } : team,
    )
    expect(openRom(buildRom({ ...project, teams })).teams[3].players[5].attributes[2]).toBe(15)
  })

  it.skipIf(!hasLeague)('takes a 30-team ROM with a base weight of 144 and 0 to 15 ratings for what it is, not for EVO', () => {
    const league = new Uint8Array(readFileSync(path(local.league30Rom!)))
    const project = openRom(marked(league, '-F3V'))
    expect(project.game.title).toBe('NHL 94 (30 teams), 0–15 ratings, base weight 144')
    expect(project.teams).toHaveLength(30)
    expect(project.teams.map((t) => t.players)).toEqual(openRom(league).teams.map((t) => t.players))
    expect(project.graphicsSupported).toBe(true)
  })
})

describe.skipIf(!hasRom)('room at the end of a ROM that a hack program has used', () => {
  // What a hack program leaves: its own code just past the end mark, which
  // the game now jumps to and so must stay exactly where it is.
  const HACK = Uint8Array.from([0xb0, 0x68, 0x00, 0x1a, 0x67, 0x00, 0x00, 0x08, 0x31, 0x68, 0x00, 0x1a, 0x00, 0x1c, 0x4e, 0x75])
  const hacked = () => {
    const project = openRom(stock())
    const bytes = project.bytes.slice()
    let last = bytes.length - 1
    while (bytes[last] === 0xff) last--
    expect(readU16(bytes, last - 1)).toBe(0x60fe)
    const at = last + 1 + 4
    bytes.set(HACK, at)
    return { project: openRom(bytes), at, mark: last - 1 }
  }
  const hackAt = (rom: Uint8Array, at: number) => Array.from(rom.subarray(at, at + HACK.length))

  it('takes room beyond the hack, and leaves the hack and the end mark alone', () => {
    const { project, at, mark } = hacked()
    const once = expandTeamSpace(project)
    const twice = expandTeamSpace(once)
    expect(nextExpansion(twice)).toBeNull()
    for (const step of [once, twice]) {
      expect(hackAt(step.bytes, at)).toEqual(Array.from(HACK))
      expect(readU16(step.bytes, mark)).toBe(0x60fe)
    }
    // What was moved sits past the hack, with a gap, and the game is pointed at it.
    const text = readU32(once.bytes, project.game.copyrightTextPointerOffset)
    expect(text).toBe(at + HACK.length + 4)
    expect(readU32(twice.bytes, project.game.playoffDrawPointerOffsets[0])).toBeGreaterThan(text)

    // The larger rosters that room is for still build, with the hack intact.
    let team = twice.teams[0]
    while (team.players.length < 26) team = addPlayer(team)
    const rom = buildRom({ ...twice, teams: twice.teams.map((t, i) => (i === 0 ? team : t)) })
    expect(hackAt(rom, at)).toEqual(Array.from(HACK))
    const reopened = openRom(rom)
    expect(reopened.teams[0].players).toHaveLength(26)
    expect(reopened.settings).toEqual(project.settings)
  })

  it('keeps the hack when the pictures are given room too, in either order', () => {
    const { project, at } = hacked()
    for (const order of [[expandTeamSpace, expandPictureSpace], [expandPictureSpace, expandTeamSpace]] as const) {
      const roomy = order.reduce((p, expand) => expand(p), project)
      expect(hackAt(roomy.bytes, at)).toEqual(Array.from(HACK))
      const reopened = openRom(buildRom(roomy))
      expect(reopened.teams.map((t) => t.players)).toEqual(roomy.teams.map((t) => t.players))
      expect(reopened.graphicsSupported).toBe(true)
    }
  })

  it('still moves the end mark along, as NOSE does, where nothing follows it', () => {
    const project = openRom(stock())
    let last = project.bytes.length - 1
    while (project.bytes[last] === 0xff) last--
    const mark = last - 1
    const roomy = expandTeamSpace(project)
    expect(readU32(roomy.bytes, project.game.copyrightTextPointerOffset)).toBe(mark)
    let end = roomy.bytes.length - 1
    while (roomy.bytes[end] === 0xff) end--
    expect(readU16(roomy.bytes, end - 1)).toBe(0x60fe)
    expect(end - 1).toBe(mark + 934)
  })

  it('says when there is no room and the file cannot grow', () => {
    const full = new Uint8Array(0x300000).fill(1)
    expect(claimSpace(full, 16)).toBeNull()
    const odd = new Uint8Array(1000).fill(1)
    expect(claimSpace(odd, 16)).toBeNull()
    const grows = claimSpace(new Uint8Array(0x100000).fill(1), 16)!
    expect(grows.rom.length).toBe(0x200000)
    expect(grows.at).toBe(0x100000 + 4)
  })
})
