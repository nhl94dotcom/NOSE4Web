import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readAscii, readU16, readU32 } from '../src/core/bytes'
import { expandTeamSpace } from '../src/core/expand'
import { NHL94_EVO } from '../src/core/games'
import { expandPictureSpace } from '../src/core/graphics'
import {
  applyHacks,
  baseWeightForYear,
  detectHacks,
  hackChanges,
  HackError,
  hackRom,
  hacksSupported,
  hackState,
  NO_HACKS,
  narrowRating,
  widenRating,
  withHacksOf,
  type Bonuses,
  type HackChoices,
} from '../src/core/hacks'
import { importTeam, ALL_PARTS } from '../src/core/importteam'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom } from '../src/core/rom'
import { changesSince } from '../src/core/season'
import { claimSpace } from '../src/core/space'
import expected from './smozrom-hashes.json'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const hasRom = existsSync(path('nhl94.bin'))
const stock = () => new Uint8Array(readFileSync(path('nhl94.bin')))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const hasLeague = !!local.league30Rom && existsSync(path(local.league30Rom))

const BONUSES: Bonuses[] = ['original', 'disabled', 'hidden', 'playersMatchLines', 'linesMatchPlayers']
// smozROM's usual set, with everything it offers switched on.
const FULL: HackChoices = {
  ...NO_HACKS,
  weightFix: 'on',
  bodychecks: 'on',
  secondAssist: true,
  plusMinus: true,
  wideRatings: true,
  bonuses: 'playersMatchLines',
  threeStars: 'linesOn',
  baseWeight: 144,
}

describe.skipIf(!hasRom)('hacks to how the game plays', () => {
  const at = (rom: Uint8Array, offset: number, length: number) => Buffer.from(rom.subarray(offset, offset + length)).toString('hex')

  it('writes what the forum posts give, and nothing else', () => {
    const rom = stock()
    const play: HackChoices = {
      ...NO_HACKS,
      checkFix: true,
      goalieHold: 300,
      goalieWidth: 40,
      goalieOut: 224,
      goalieLine: 144,
      stamina: true,
      energyDrain: 65,
      energyRecovery: 6,
      speedBurst: 24,
      turnRate: 300,
      realTime: true,
    }
    const hacked = hackRom(rom, play)
    const expected: [number, string][] = [
      [0x13d6c, '4e714e71'],
      [0x1530e, '012c'],
      [0xb632, '0028'],
      [0xb650, 'ffd8'],
      [0xb66a, '00e0'],
      [0xb674, 'ff20'],
      [0xd3ea, '0090'],
      [0xd3f2, 'ff70'],
      [0x15782, '6002'],
      [0x10d42, '0041'],
      [0x7a1a, '0006'],
      [0xbb88, '7018'],
      [0x10e24, '012c'],
      [0x10e32, '012c'],
      [0x10e48, '012c'],
      [0x10e56, '012c'],
      [0x15dec, '0444'],
      [0x128cc, '003c'],
      [0x15e32, '0444'],
    ]
    for (const [offset, bytes] of expected) expect(at(hacked, offset, bytes.length / 2), offset.toString(16)).toBe(bytes)
    // Those are the only bytes that differ, and the ROM is no larger.
    expect(hacked.length).toBe(rom.length)
    const changed = new Set<number>()
    hacked.forEach((byte, i) => byte !== rom[i] && changed.add(i))
    const allowed = new Set(expected.flatMap(([offset, bytes]) => Array.from({ length: bytes.length / 2 }, (_, i) => offset + i)))
    expect([...changed].filter((i) => !allowed.has(i))).toEqual([])
    expect(detectHacks(hacked)).toEqual({ choices: play, unknown: [] })
    expect(Buffer.compare(hackRom(hacked, NO_HACKS), rom)).toBe(0)
  })

  it('stops the goalie whistle by leaving its count alone, and refuses numbers the game cannot take', () => {
    const rom = stock()
    const never = hackRom(rom, { ...NO_HACKS, goalieHold: 0 })
    expect(at(never, 0xd4c6, 2)).toBe('6002')
    expect(at(never, 0x1530e, 2)).toBe('008c')
    expect(() => hackRom(rom, { ...NO_HACKS, speedBurst: 96 })).toThrow('Speed burst has to be a whole number from 0 to 95.')
    expect(() => hackRom(rom, { ...NO_HACKS, turnRate: 0 })).toThrow(HackError)
    expect(() => hackRom(rom, { ...NO_HACKS, goalieOut: 1.5 })).toThrow(HackError)
  })

  it('leaves alone what it does not recognise, and says what changed', () => {
    const rom = stock()
    // The two ends of the ice disagree, and the clocks are half changed.
    rom.set([0x00, 0x30], 0xb632)
    rom.set([0x04, 0x44], 0x15dec)
    const state = detectHacks(rom)
    expect(state.unknown).toEqual(['clock', 'goalieBox'])
    const hacked = hackRom(rom, { ...NO_HACKS, goalieWidth: 60, goalieOut: 200, realTime: true, turnRate: 200 })
    expect(at(hacked, 0xb632, 2)).toBe('0030')
    expect(at(hacked, 0xb66a, 2)).toBe('00e7')
    expect(at(hacked, 0x128cc, 2)).toBe('0018')
    expect(at(hacked, 0x10e24, 2)).toBe('00c8')
    expect(hackChanges(NO_HACKS, { ...NO_HACKS, goalieHold: 0, speedBurst: 16, realTime: true, goalieOut: 224 })).toEqual([
      'Goalie hold time: 2.33 seconds to no whistle.',
      'Goalie range up the ice: 231 to 224.',
      "Speed burst: the original game's to 16.",
      'Real-time clock: off to on.',
    ])
  })
})

describe('the weight smozROM suggests for a season', () => {
  it('follows its table, and uses the ends of it for years outside', () => {
    expect(baseWeightForYear(1994)).toBe(140)
    expect(baseWeightForYear(1950)).toBe(112)
    expect(baseWeightForYear(1932)).toBe(108)
    expect(baseWeightForYear(2010)).toBe(144)
    expect(baseWeightForYear(1900)).toBe(112)
    expect(baseWeightForYear(2050)).toBe(144)
  })
})

describe('ratings restated between the two scales', () => {
  it('keeps what a rating is worth on the ice, and comes back the same', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(widenRating)).toEqual([0, 3, 5, 8, 10, 13, 15])
    for (let value = 0; value <= 6; value++) expect(narrowRating(widenRating(value))).toBe(value)
    expect(Array.from({ length: 16 }, (_, value) => narrowRating(value))).toEqual([0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5, 5, 6, 6])
  })
})

describe('hacks and kinds of ROM', () => {
  it('are not offered for a ROM rebuilt as far as EVO is', () => {
    expect(hacksSupported(NHL94_EVO)).toBe(false)
  })

  it('puts code at an even address, after a gap, without moving the end mark', () => {
    const rom = new Uint8Array(0x1000).fill(0xff)
    rom.set([0x60, 0xfe], 0x100)
    expect(claimSpace(rom, 8, true)!.at).toBe(0x106)
    expect(claimSpace(rom, 8)!.at).toBe(0x100)
    rom[0x102] = 1 // something ending on an even address
    expect(claimSpace(rom, 8, true)!.at).toBe(0x108)
  })
})

describe.skipIf(!hasRom)('hacks from smozROM', () => {
  // smozROM itself was run on the original game for every combination of its
  // questions, and the start of each result's SHA-256 kept. The keys are its
  // answers: weight bug fix, season, rating scale, three stars, Edit Lines.
  it('makes the same ROM as smozROM, byte for byte, for every combination of its choices', () => {
    const opened = openRom(stock())
    const wrong: string[] = []
    for (const [answers, hash] of Object.entries(expected as Record<string, string>)) {
      const [fix, year, scale, stars, lines] = answers.split('_')
      const choices: HackChoices = {
        ...NO_HACKS,
        weightFix: fix === 'y' ? 'on' : 'off',
        bodychecks: fix === 'y' ? 'on' : 'off',
        secondAssist: true,
        plusMinus: true,
        wideRatings: scale === '15',
        bonuses: BONUSES[Number(lines) - 1],
        threeStars: stars === 'n' ? 'original' : stars === 'off' ? 'linesOff' : 'linesOn',
        baseWeight: baseWeightForYear(Number(year)),
      }
      const hacked = applyHacks(opened, choices).bytes
      if (createHash('sha256').update(hacked).digest('hex').slice(0, 16) !== hash) wrong.push(answers)
      // What was put in is what is found, and taking it all out gives the ROM back.
      const state = detectHacks(hacked)
      if (state.unknown.length > 0 || JSON.stringify(state.choices) !== JSON.stringify(choices)) wrong.push(`${answers} read back`)
      if (Buffer.compare(applyHacks({ ...opened, bytes: hacked }, NO_HACKS).bytes, opened.bytes) !== 0) wrong.push(`${answers} removed`)
    }
    expect(Object.keys(expected)).toHaveLength(180)
    expect(wrong).toEqual([])
  })

  it('finds no hacks in the original game', () => {
    expect(hackState(openRom(stock()))).toEqual({ choices: NO_HACKS, unknown: [] })
    // The ROM as it comes, before the editor has touched it, reads the same.
    expect(detectHacks(stock())).toEqual({ choices: NO_HACKS, unknown: [] })
  })

  it('makes each hack on its own, and the same ROM whatever was there before', () => {
    const opened = openRom(stock())
    const each: Partial<HackChoices>[] = [
      { weightFix: 'on' },
      { weightFix: 'simple' },
      { bodychecks: 'on' },
      { secondAssist: true },
      { plusMinus: true },
      { wideRatings: true },
      { bonuses: 'disabled' },
      { threeStars: 'linesOff' },
      { baseWeight: 102 },
      { baseWeight: 152 },
      { checkFix: true },
      { goalieHold: 0 },
      { goalieHold: 300 },
      { goalieWidth: 40, goalieOut: 224 },
      { goalieLine: 96 },
      { stamina: true },
      { energyDrain: 65, energyRecovery: 6 },
      { speedBurst: 24 },
      { turnRate: 300 },
      { realTime: true },
    ]
    for (const change of each) {
      const wanted = { ...NO_HACKS, ...change }
      const direct = applyHacks(opened, wanted)
      expect(detectHacks(direct.bytes)).toEqual({ choices: wanted, unknown: [] })
      const viaFull = applyHacks(applyHacks(opened, FULL), wanted)
      expect(Buffer.compare(viaFull.bytes, direct.bytes)).toBe(0)
      expect(Buffer.compare(applyHacks(direct, wanted).bytes, direct.bytes)).toBe(0)
    }
  })

  it('calls the code it adds from the right places, at even addresses in unused room', () => {
    const opened = openRom(stock())
    const hacked = applyHacks(opened, FULL).bytes
    let end = opened.bytes.length - 1
    while (opened.bytes[end] === 0xff) end--
    for (const at of [0x13d72, 0x14130, 0x10188, 0xf6ce4, 0xf710a, 0x1494a]) {
      expect(readU16(hacked, at)).toBe(0x4eb9)
      const target = readU32(hacked, at + 2)
      expect(target % 2).toBe(0)
      expect(target).toBeGreaterThan(end + 4)
      expect(target).toBeLessThan(hacked.length)
    }
    expect(readU32(hacked, 0x10188 + 2)).toBe(readU32(hacked, 0xf6ce4 + 2)) // one fix, called twice
    expect(readU16(hacked, end - 1)).toBe(0x60fe) // the end mark has not moved
    expect(hacked.length).toBe(opened.bytes.length)
  })

  it('marks the product code, so the editor shows the new scale and weights', () => {
    const opened = openRom(stock())
    const hacked = applyHacks(opened, FULL)
    expect(readAscii(hacked.bytes, 0x180, 14)).toBe('GM T-50656-F0V')
    expect(hacked.game.title).toBe('NHL 94, 0–15 ratings, base weight 144')
    expect(hacked.game.playerAttributeKinds.slice(0, 2)).toEqual(['weight:144', 'value'])
    const plain = applyHacks(hacked, NO_HACKS)
    expect(plain.game).toBe(opened.game)
    const retro = applyHacks(opened, { ...NO_HACKS, baseWeight: 102 })
    expect(readAscii(retro.bytes, 0x180, 14)).toBe('GM T-50656 -0A')
    expect(() => applyHacks(opened, { ...NO_HACKS, baseWeight: 141 })).toThrow(HackError)
  })

  it('restates every rating and weight when the scale or the base changes, and puts them back', () => {
    const opened = { ...openRom(stock()), freeAgents: [{ player: openRom(stock()).teams[3].players[5], role: 'F' as const }] }
    const wide = applyHacks(opened, { ...NO_HACKS, wideRatings: true })
    const [was, now] = [opened.teams[3].players[5], wide.teams[3].players[5]]
    expect(now.name).toBe(was.name)
    opened.game.playerAttributeKinds.forEach((kind, i) => expect(now.attributes[i]).toBe(kind === 'rating' ? widenRating(was.attributes[i]) : was.attributes[i]))
    const goalie = wide.teams[3].players[0]
    opened.game.goalieAttributeKinds.forEach((kind, i) => expect(goalie.attributes[i]).toBe(kind === 'rating' ? widenRating(opened.teams[3].players[0].attributes[i]) : opened.teams[3].players[0].attributes[i]))
    expect(wide.freeAgents[0].player).toEqual(now)
    // Nothing but the players has changed, and going back loses nothing.
    expect(wide.teams.map((t) => t.lines)).toEqual(opened.teams.map((t) => t.lines))
    const back = applyHacks(wide, NO_HACKS)
    expect(back.teams).toEqual(opened.teams)
    expect(back.freeAgents).toEqual(opened.freeAgents)

    // A base weight four pounds on leaves every stored weight where it was; eight pounds on moves each down a step.
    expect(applyHacks(opened, { ...NO_HACKS, baseWeight: 144 }).teams).toEqual(opened.teams)
    const heavier = applyHacks(opened, { ...NO_HACKS, baseWeight: 148 })
    opened.teams[0].players.forEach((player, i) => expect(heavier.teams[0].players[i].attributes[0]).toBe(Math.max(0, player.attributes[0] - 1)))
    // Changing a hack that touches no ratings leaves the players alone.
    expect(applyHacks(opened, { ...NO_HACKS, secondAssist: true }).teams).toBe(opened.teams)
  })

  it('builds a ROM that opens again with its hacks and its teams', () => {
    const hacked = applyHacks(openRom(stock()), FULL)
    const renamed = { ...hacked, teams: hacked.teams.map((team, i) => (i === 0 ? { ...team, players: team.players.map((p, j) => (j === 3 ? { ...p, name: p.name.split('').reverse().join('') } : p)) } : team)) }
    const reopened = openRom(buildRom(renamed))
    expect(reopened.game).toBe(hacked.game)
    expect(hackState(reopened)).toEqual({ choices: FULL, unknown: [] })
    expect(reopened.teams.map((t) => t.players)).toEqual(renamed.teams.map((t) => t.players))
    expect(reopened.settings).toEqual(hacked.settings)
  })

  it('lives with roster and picture room made before or after', () => {
    const opened = openRom(stock())
    const orders = [
      (p: typeof opened) => applyHacks(expandPictureSpace(expandTeamSpace(expandTeamSpace(p))), FULL),
      (p: typeof opened) => expandPictureSpace(expandTeamSpace(expandTeamSpace(applyHacks(p, FULL)))),
      (p: typeof opened) => applyHacks(expandTeamSpace(applyHacks(expandTeamSpace(p), { ...FULL, bonuses: 'disabled' })), FULL),
    ]
    for (const order of orders) {
      const project = order(opened)
      expect(hackState(project)).toEqual({ choices: FULL, unknown: [] })
      const reopened = openRom(buildRom(project))
      expect(hackState(reopened)).toEqual({ choices: FULL, unknown: [] })
      expect(reopened.teams.map((t) => t.players)).toEqual(project.teams.map((t) => t.players))
      expect(reopened.settings).toEqual(opened.settings)
      // And the hacks come out again cleanly, leaving the room that was made.
      const plain = applyHacks(project, NO_HACKS)
      expect(hackState(plain)).toEqual({ choices: NO_HACKS, unknown: [] })
      expect(openRom(buildRom(plain)).settings).toEqual(opened.settings)
    }
  })

  it('leaves alone code it does not recognise, and changes the rest', () => {
    const opened = openRom(stock())
    const strange = opened.bytes.slice()
    strange.set([0x4e, 0x71, 0x4e, 0x71], 0x1867e + 40) // three stars
    strange.set([0x4e, 0xb9, 0x00, 0x0f, 0xff, 0x00], 0x1494a) // a call to somewhere else, where plus-minus hooks in
    const project = { ...opened, bytes: strange }
    expect(hackState(project)!.unknown).toEqual(['plusMinus', 'threeStars'])

    const hacked = applyHacks(project, FULL)
    expect(Array.from(hacked.bytes.slice(0x1867e, 0x1867e + 158))).toEqual(Array.from(strange.slice(0x1867e, 0x1867e + 158)))
    expect(Array.from(hacked.bytes.slice(0x1494a, 0x1494a + 6))).toEqual([0x4e, 0xb9, 0x00, 0x0f, 0xff, 0x00])
    expect(Array.from(hacked.bytes.slice(0x17132, 0x17132 + 38))).toEqual(Array.from(strange.slice(0x17132, 0x17132 + 38)))
    const state = hackState(hacked)!
    expect(state.unknown).toEqual(['plusMinus', 'threeStars'])
    expect(state.choices).toEqual({ ...FULL, plusMinus: false, threeStars: 'original' })
    expect(hacked.game.title).toBe('NHL 94, 0–15 ratings, base weight 144')

    // A ROM with no room left says so and is not changed.
    const full = opened.bytes.slice()
    full.fill(1, 0xff000)
    expect(hackRom(full, { ...NO_HACKS, secondAssist: true }).length).toBe(0x200000) // it grows, as rosters do
    const largest = new Uint8Array(0x300000).fill(1)
    largest.set(full)
    expect(() => hackRom(largest, { ...NO_HACKS, secondAssist: true })).toThrow('There is no room left in this ROM')
    expect(() => applyHacks(opened, { ...NO_HACKS, bodychecks: 'earlier' })).toThrow('does not have the earlier bodycheck statistics')
  })

  it('carries hacks in a project file, and puts them into the ROM it is opened over', () => {
    const opened = openRom(stock())
    const hacked = applyHacks(opened, FULL)
    const edited = { ...hacked, teams: hacked.teams.map((team, i) => (i === 2 ? { ...team, players: team.players.map((p, j) => (j === 6 ? { ...p, attributes: p.attributes.map((v, a) => (a === 2 ? 14 : v)) } : p)) } : team)) }
    const text = saveProjectFile(edited, withHacksOf(opened, edited), 'S')
    const result = openProjectFile(opened, text)
    expect(result.notes.join(' ')).toContain("The project's hacks were put into this ROM.")
    expect(hackState(result.project)).toEqual({ choices: FULL, unknown: [] })
    expect(result.project.game).toBe(hacked.game)
    expect(result.project.teams.map((t) => t.players)).toEqual(edited.teams.map((t) => t.players))
    expect(result.project.teams[2].players[6].attributes[2]).toBe(14)
    // Over a ROM that has them already, nothing is said or done about hacks.
    const again = openProjectFile(openRom(buildRom(hacked)), text)
    expect(again.notes.join(' ')).not.toContain('hacks')
    // A project from before hacks were kept opens as ever.
    const older = JSON.stringify({ ...JSON.parse(saveProjectFile(opened, opened, 'S')), hacks: undefined })
    expect(openProjectFile(opened, older).project.game).toBe(opened.game)
  })

  it('reports hacks as changes, and nothing else that hacking did', () => {
    const opened = openRom(stock())
    const hacked = applyHacks(opened, { ...NO_HACKS, wideRatings: true, secondAssist: true, baseWeight: 148 })
    // The ROM as opened is brought to the same scales before the two are compared.
    const original = withHacksOf(opened, hacked)
    expect(original.game).toBe(hacked.game)
    expect(original.teams).toEqual(hacked.teams)
    expect(withHacksOf(opened, opened)).toBe(opened)
    expect(changesSince(hacked, original).details).toEqual([
      { heading: 'Hacks', changes: ['Second-assist bug fix: off to on.', 'Rating scale: 0 to 6 to 0 to 15.', 'Base weight: 140 pounds to 148 pounds.'] },
    ])
    // An edit made afterwards is listed on the new scale, beside the hacks.
    const edited = { ...hacked, teams: hacked.teams.map((team, i) => (i === 0 ? { ...team, players: team.players.map((p, j) => (j === 4 ? { ...p, attributes: p.attributes.map((v, a) => (a === 1 ? 15 : v)) } : p)) } : team)) }
    const details = changesSince(edited, original).details
    expect(details).toHaveLength(2)
    expect(details[1].changes).toHaveLength(1)
    expect(details[1].changes[0]).toContain('to 15')
    // Comparing two different ROMs sets their own hacks side by side.
    const apart = changesSince(openRom(buildRom(hacked)), opened).details
    expect(apart[0]).toEqual({ heading: 'In general', changes: [expect.stringContaining('different games')] })
    expect(apart[1]).toEqual(changesSince(hacked, original).details[0])
  })

  it('restates ratings when a team comes in from a ROM on the other scale', () => {
    const narrow = openRom(stock())
    const wide = applyHacks(narrow, { ...NO_HACKS, wideRatings: true })
    const into = importTeam(wide, narrow, 5, 5, ALL_PARTS)
    expect(into.notes.join(' ')).toContain("Each rating was restated on this ROM's scale.")
    expect(into.project.teams[5].players).toEqual(wide.teams[5].players)
    const outOf = importTeam(narrow, wide, 5, 5, ALL_PARTS)
    expect(outOf.project.teams[5].players).toEqual(narrow.teams[5].players)
    expect(importTeam(narrow, narrow, 5, 6, ALL_PARTS).notes.join(' ')).not.toContain('restated')
  })
})

describe.skipIf(!hasLeague)('hacks already in a league ROM', () => {
  const league = () => openRom(new Uint8Array(readFileSync(path(local.league30Rom!))))

  it('are all recognised, and survive a change to one of them', () => {
    const opened = league()
    const state = hackState(opened)!
    expect(state.unknown).toEqual([])
    expect(state.choices.secondAssist).toBe(true)
    expect(state.choices.plusMinus).toBe(true)

    // Applying what is there changes nothing that matters, and the ROM still opens the same.
    const same = applyHacks(opened, state.choices)
    expect(hackState(same)).toEqual(state)
    expect(same.game).toBe(opened.game)
    expect(same.teams).toBe(opened.teams)

    const changed = applyHacks(opened, { ...state.choices, threeStars: state.choices.threeStars === 'linesOn' ? 'linesOff' : 'linesOn' })
    expect(hackState(changed)!.choices).toEqual({ ...state.choices, threeStars: state.choices.threeStars === 'linesOn' ? 'linesOff' : 'linesOn' })
    const reopened = openRom(buildRom(changed))
    expect(reopened.teams.map((t) => t.players)).toEqual(opened.teams.map((t) => t.players))
    expect(reopened.settings).toEqual(opened.settings)
    expect(hackState(reopened)).toEqual(hackState(changed))
  })

  it('keeps an earlier version of the bodycheck statistics unless told to replace it', () => {
    const opened = league()
    const state = hackState(opened)!
    if (state.choices.bodychecks !== 'earlier') return
    const target = readU32(opened.bytes, 0x14130 + 2)
    const code = Array.from(opened.bytes.slice(target, target + 58))
    const kept = applyHacks(opened, { ...state.choices, weightFix: 'on' })
    expect(readU32(kept.bytes, 0x14130 + 2)).toBe(target)
    expect(Array.from(kept.bytes.slice(target, target + 58))).toEqual(code)
    expect(hackState(kept)!.choices.bodychecks).toBe('earlier')

    const replaced = applyHacks(opened, { ...state.choices, bodychecks: 'on' })
    expect(hackState(replaced)).toEqual({ choices: { ...state.choices, bodychecks: 'on' }, unknown: [] })
    expect(hackState(openRom(buildRom(replaced)))!.choices.bodychecks).toBe('on')
    const removed = applyHacks(opened, { ...state.choices, bodychecks: 'off' })
    expect(readAscii(removed.bytes, 0x993f, 3)).toBe('PIM')
    expect(hackState(removed)!.choices.bodychecks).toBe('off')
  })
})
