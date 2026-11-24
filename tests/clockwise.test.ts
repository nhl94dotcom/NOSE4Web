import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { clockwiseExtras, clockwiseKept, clockwiseRecords, clockwiseState, faceoffAnim, hasNoseTape, putClockwise, takeOutClockwise } from '../src/core/clockwise'
import { detectHacks, hackRom, hacksSupported, NO_HACKS, type HackChoices } from '../src/core/hacks'
import { fightState } from '../src/core/fight'
import { unpackTiles } from '../src/core/genesisunpack'
import { buildRom, openRom } from '../src/core/rom'
import { expectSameBytes } from './samebytes'

// Clockwise's sprite edit: NHL 94 at ../nhl94.bin, their IPS beside it, and the league ROMs named in local.json.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const leagueNames = [...(local.league30Rom ? [local.league30Rom] : []), ...(local.otherRoms ?? [])].filter((name) => existsSync(path(name)))
const ORIGINAL = path('nhl94.bin')
const IPS = path('NHL_94_sprite_edit_by_clockwise.ips')
const CDL = 'CDL_Season_12.bin'
const GDL = 'GDL_Season4.bin'
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const is = (rom: Uint8Array, at: number, bytes: Uint8Array) => bytes.every((byte, i) => rom[at + i] === byte)
const withChoices = (rom: Uint8Array, more: Partial<HackChoices>) => hackRom(rom, { ...detectHacks(rom).choices, ...more })
// Which records hold the original game's bytes, Clockwise's, or neither.
// The records in sprite tiles a league has redrawn itself (where some record has neither the original game's
// bytes nor Clockwise's), which the edit leaves alone both ways.
const TILES = 0x5de84
const tilesOfRecord = (r: { at: number; original: Uint8Array }) => [Math.floor((r.at - TILES) / 32), Math.floor((r.at + r.original.length - 1 - TILES) / 32)]
const leftAlone = (rom: Uint8Array) => {
  const own = new Set<number>()
  for (const r of clockwiseRecords()) if (!is(rom, r.at, r.original) && !is(rom, r.at, r.patched)) tilesOfRecord(r).forEach((t) => own.add(t))
  return clockwiseRecords().filter((r) => tilesOfRecord(r).some((t) => own.has(t)))
}
const tally = (rom: Uint8Array) => {
  const counts = { original: 0, patched: 0, own: 0 }
  for (const r of clockwiseRecords()) {
    if (is(rom, r.at, r.original)) counts.original++
    else if (is(rom, r.at, r.patched)) counts.patched++
    else counts.own++
  }
  return counts
}
// Where NOSE4Web's additions are in a ROM: the untaped frames' tape, the fight frames', and the faceoff close-up's
// (in its packed stream, or in its plain tiles).
const extraRanges = (rom: Uint8Array): [number, number][] => {
  const { sprite, fight, faceoff, packed } = clockwiseExtras()
  const out = [...sprite, ...fight].map((t): [number, number] => [t.at, t.at + t.original.length])
  const anim = faceoffAnim(rom)
  if (anim !== null) {
    const list = rom[anim + 8] & 0x80 ? packed : faceoff
    for (const t of list) out.push([anim + 10 + t.at, anim + 10 + t.at + t.original.length])
  }
  return out
}
// Where two ROMs of one size differ, outside the records and NOSE4Web's additions.
const outsideDiffers = (a: Uint8Array, b: Uint8Array) => {
  const inRecord = new Uint8Array(a.length)
  for (const r of clockwiseRecords()) inRecord.fill(1, r.at, r.at + r.original.length)
  for (const [from, to] of [...extraRanges(a), ...extraRanges(b)]) inRecord.fill(1, from, to)
  // And the block that says which records a ROM had before (clockwiseKept).
  for (const kept of [clockwiseKept(a), clockwiseKept(b)]) if (kept) inRecord.fill(1, kept.at, kept.at + kept.length)
  const out: number[] = []
  for (let i = 0; i < a.length; i++) if (!inRecord[i] && a[i] !== b[i]) out.push(i)
  return out
}

describe("Clockwise's sprite edit data", () => {
  it('has its 3,498 records in order, in the sprite tiles, each a change', () => {
    const records = clockwiseRecords()
    expect(records.length).toBe(3498)
    expect(records[0].at).toBe(0x5de91)
    const last = records.at(-1)!
    expect(last.at + last.original.length).toBe(0x9e0fb)
    for (let i = 0; i < records.length; i++) {
      const r = records[i]
      expect(r.patched.length).toBe(r.original.length)
      expect(r.original.length).toBeGreaterThan(0)
      expect(r.original.every((byte, j) => byte === r.patched[j])).toBe(false)
      if (i > 0) expect(r.at).toBeGreaterThanOrEqual(records[i - 1].at + records[i - 1].original.length)
    }
  })

  it('is unknown in a ROM too short for the tiles', () => {
    expect(clockwiseState(new Uint8Array(0x80000))).toBeUndefined()
  })
})

describe.skipIf(!existsSync(IPS) || !existsSync(ORIGINAL))("Clockwise's sprite edit against their IPS", () => {
  it('is the IPS without its header records, against the original game', () => {
    const ips = new Uint8Array(readFileSync(IPS))
    const original = new Uint8Array(readFileSync(ORIGINAL))
    expect(Buffer.from(ips.subarray(0, 5)).toString('latin1')).toBe('PATCH')
    const patched = original.slice()
    let i = 5
    let header = 0
    for (;;) {
      if (Buffer.from(ips.subarray(i, i + 3)).toString('latin1') === 'EOF' && (i + 3 === ips.length || i + 6 === ips.length)) break
      const at = (ips[i] << 16) | (ips[i + 1] << 8) | ips[i + 2]
      const size = (ips[i + 3] << 8) | ips[i + 4]
      i += 5
      let bytes: Uint8Array
      if (size === 0) {
        bytes = new Uint8Array((ips[i] << 8) | ips[i + 1]).fill(ips[i + 2])
        i += 3
      } else {
        bytes = ips.subarray(i, i + size)
        i += size
      }
      if (at < 0x200) header++
      else patched.set(bytes, at)
    }
    expect(header).toBe(5)
    // With NOSE4Web's tape in the faceoff close-up besides, which comes out alone.
    const ours = hackRom(original, { ...NO_HACKS, clockwiseSprites: true })
    expect(outsideDiffers(ours, patched)).toEqual([])
    const anim = faceoffAnim(original)!
    for (const t of clockwiseExtras().packed) {
      expect(ours.subarray(anim + 10 + t.at, anim + 10 + t.at + t.patched.length)).toEqual(t.patched)
      ours.set(t.original, anim + 10 + t.at)
    }
    // And in the frames they left untaped.
    for (const t of clockwiseExtras().sprite) {
      expect(ours.subarray(t.at, t.at + t.patched.length)).toEqual(t.patched)
      ours.set(t.original, t.at)
    }
    expectSameBytes(ours, patched)
  })
})

describe.skipIf(!existsSync(ORIGINAL))("Clockwise's sprite edit on the original game", () => {
  it('goes in at every record and comes out byte for byte', () => {
    const project = openRom(new Uint8Array(readFileSync(ORIGINAL)))
    const rom = project.bytes
    expect(detectHacks(rom)).toEqual({ choices: NO_HACKS, unknown: [] })
    expect(tally(rom)).toEqual({ original: 3498, patched: 0, own: 0 })
    const on = hackRom(rom, { ...NO_HACKS, clockwiseSprites: true })
    expect(tally(on)).toEqual({ original: 0, patched: 3498, own: 0 })
    expect(outsideDiffers(on, rom)).toEqual([])
    expect(detectHacks(on)).toEqual({ choices: { ...NO_HACKS, clockwiseSprites: true }, unknown: [] })
    expect(detectHacks(buildRom({ ...project, bytes: on })).choices.clockwiseSprites).toBe(true)
    // Again on: the same ROM.
    expectSameBytes(hackRom(on, { ...NO_HACKS, clockwiseSprites: true }), on)
    expectSameBytes(hackRom(on, NO_HACKS), rom)
  })

  it('refuses other net colours, as it redraws the nets for the rink colours', () => {
    const rom = new Uint8Array(readFileSync(ORIGINAL))
    expect(() => hackRom(rom, { ...NO_HACKS, clockwiseSprites: true, netColours: 'home' })).toThrow(/nets/)
  })

  it('goes with the fighting patch, head bleeding and the goalie stick fix, in either order', () => {
    const rom = openRom(new Uint8Array(readFileSync(ORIGINAL))).bytes
    const others: Partial<HackChoices> = { fighting: 'on', headBleeding: true, goalieBladeFix: true }
    const all = { ...NO_HACKS, ...others, clockwiseSprites: true }
    const together = hackRom(rom, all)
    expect(detectHacks(together)).toEqual({ choices: all, unknown: [] })
    expect(tally(together)).toEqual({ original: 0, patched: 3498, own: 0 })
    const withoutIt = hackRom(rom, { ...NO_HACKS, ...others })
    expect(together.length).toBe(withoutIt.length)
    expect(outsideDiffers(together, withoutIt)).toEqual([])
    // The others first, then this; this first, then the others.
    expectSameBytes(withChoices(withoutIt, { clockwiseSprites: true }), together)
    expectSameBytes(withChoices(hackRom(rom, { ...NO_HACKS, clockwiseSprites: true }), others), together)
    // Each by itself in turn.
    let stepped = rom
    for (const more of [{ clockwiseSprites: true }, { fighting: 'on' }, { goalieBladeFix: true }, { headBleeding: true }] as Partial<HackChoices>[]) stepped = withChoices(stepped, more)
    expectSameBytes(stepped, together)
    // Out again: this alone, the others alone, then everything.
    expectSameBytes(withChoices(together, { clockwiseSprites: false }), withoutIt)
    const onlyIt = withChoices(together, { fighting: 'none', headBleeding: false, goalieBladeFix: false })
    expectSameBytes(onlyIt, hackRom(rom, { ...NO_HACKS, clockwiseSprites: true }))
    expectSameBytes(hackRom(together, NO_HACKS), rom)
  })
})

describe.skipIf(!existsSync(path(CDL)))("Clockwise's sprite edit on a league ROM with art of its own", () => {
  it('keeps the league’s own art, and turning it off again gives the original game’s at the records', () => {
    const rom = open(CDL).bytes
    const before = tally(rom)
    expect(before).toEqual({ original: 3449, patched: 1, own: 48 })
    const state = detectHacks(rom)
    expect(state.unknown).not.toContain('clockwiseSprites')
    expect(state.choices.clockwiseSprites).toBe(false)
    // CDL's own nets: their tiles are left alone, the one record there that has Clockwise's bytes too among them.
    const alone = leftAlone(rom)
    const aloneOriginal = alone.filter((r) => is(rom, r.at, r.original)).length
    expect(alone.filter((r) => is(rom, r.at, r.patched)).length).toBe(1)
    const on = withChoices(rom, { clockwiseSprites: true })
    expect(detectHacks(on).choices).toEqual({ ...state.choices, clockwiseSprites: true })
    expect(tally(on)).toEqual({ original: aloneOriginal, patched: 3450 - aloneOriginal, own: 48 })
    for (const r of alone) expect(on.subarray(r.at, r.at + r.original.length)).toEqual(rom.subarray(r.at, r.at + r.original.length))
    expect(clockwiseKept(on)).toBeNull()
    // The editor puts the league's other hacks in afresh (their code may move), so compare with the ROM as it does that.
    const same = withChoices(rom, {})
    expect(tally(same)).toEqual(before)
    expect(on.length).toBe(same.length)
    expect(outsideDiffers(on, same)).toEqual([])
    // Off: the ROM as it was, CDL's nets untouched (Match Viewer found their one Clockwise record turned original).
    const off = withChoices(on, { clockwiseSprites: false })
    expectSameBytes(off, same)
    // And on again: as before.
    expectSameBytes(withChoices(off, { clockwiseSprites: true }), on)
  })

  it('with head bleeding too, on and off gives the ROM back, the blood where it was', () => {
    // Head bleeding comes out and goes back last at every apply, so the code the ROM's own hacks place does not move
    // past it on a second apply (Match Viewer found 268 bytes moved on CDL).
    const bleeding = withChoices(open(CDL).bytes, { headBleeding: true })
    expectSameBytes(withChoices(bleeding, {}), bleeding)
    const on = withChoices(bleeding, { clockwiseSprites: true })
    expectSameBytes(withChoices(on, { clockwiseSprites: false }), bleeding)
  })
})

describe.skipIf(!existsSync(path(GDL)))("Clockwise's sprite edit in a league ROM that has it", () => {
  it('reads on, and off gives the original game’s art at the records', () => {
    const rom = open(GDL).bytes
    expect(tally(rom)).toEqual({ original: 0, patched: 3498, own: 0 })
    expect(detectHacks(rom).choices.clockwiseSprites).toBe(true)
    // Clockwise's own patch, none of NOSE4Web's tape: other hacks put in leave the sprites as they are.
    expect(hasNoseTape(rom)).toBe(false)
    expectSameBytes(withChoices(rom, {}), rom)
    const off = withChoices(rom, { clockwiseSprites: false })
    expect(tally(off)).toEqual({ original: 3498, patched: 0, own: 0 })
    expect(outsideDiffers(off, rom)).toEqual([])
    // Turned on again, it has the tape, and off once more gives the same ROM.
    const again = withChoices(off, { clockwiseSprites: true })
    expect(tally(again)).toEqual({ original: 0, patched: 3498, own: 0 })
    expect(hasNoseTape(again)).toBe(true)
    expectSameBytes(withChoices(again, { clockwiseSprites: false }), off)
  })
})

describe.skipIf(leagueNames.length === 0)("Clockwise's sprite edit in the league ROMs", () => {
  it.each(leagueNames)('reads and goes into %s, changing only records with the original game’s art', (name) => {
    const project = open(name)
    // Only the EVO builds, whose code is their own, take no hacks.
    expect(hacksSupported(project.game)).toBe(!name.includes('EVO'))
    if (name.includes('EVO')) return
    const rom = project.bytes
    const state = detectHacks(rom)
    expect(state.unknown).not.toContain('clockwiseSprites')
    const before = tally(rom)
    expect(state.choices.clockwiseSprites).toBe(before.original === 0 && before.patched > 0)
    const on = withChoices(rom, { clockwiseSprites: true })
    expect(detectHacks(on).choices).toEqual({ ...state.choices, clockwiseSprites: before.patched + before.original > 0 })
    const aloneOriginal = leftAlone(rom).filter((r) => is(rom, r.at, r.original)).length
    expect(tally(on)).toEqual({ original: aloneOriginal, patched: before.original + before.patched - aloneOriginal, own: before.own })
    // Against the ROM with its own choices put in afresh, as the editor does.
    const same = withChoices(rom, {})
    expect(tally(same)).toEqual(before)
    expect(on.length).toBe(same.length)
    expect(outsideDiffers(on, same)).toEqual([])
    // Off again, where it was off: the ROM as it was, the records it had of Clockwise's before kept (the block).
    if (!state.choices.clockwiseSprites) {
      // A block only where some record it uses had Clockwise's bytes already.
      expect(clockwiseKept(on) !== null).toBe(before.patched > leftAlone(rom).filter((r) => is(rom, r.at, r.patched)).length)
      expectSameBytes(withChoices(on, { clockwiseSprites: false }), same)
    }
  })
})

// ------------------------------------------------ NOSE4Web's additions
// Where two byte arrays of one size differ, as a map of offset to [a's byte, b's byte].
const changes = (a: Uint8Array, b: Uint8Array, from = 0, to = a.length) => {
  const out = new Map<number, [number, number]>()
  for (let i = from; i < to; i++) if (a[i] !== b[i]) out.set(i, [a[i], b[i]])
  return out
}
// The bytes the tape changes, as a map of offset (plus `base`) to [before, after].
const tapeChanges = (list: readonly { at: number; original: Uint8Array; patched: Uint8Array }[], base = 0) => {
  const out = new Map<number, [number, number]>()
  for (const t of list) t.original.forEach((byte, i) => byte !== t.patched[i] && out.set(base + t.at + i, [byte, t.patched[i]]))
  return out
}
const tilesOf = (rom: Uint8Array) => unpackTiles(rom, faceoffAnim(rom)! + 8)!
// Where the CDL ROMs keep the faceoff tiles plain (MV's ROM offsets are these plus the tile offsets).
const CDL_TILES = 0x11ea92

describe("NOSE4Web's additions to Clockwise's sprite edit: data", () => {
  it('has the untaped frames’ 108 bytes in 96 runs, the fight frames’ 38 in 28 and the faceoff’s 50 in 22 (the first tape’s 81 in 27), each a change, in order', () => {
    const { sprite, fight, faceoff, packed, firstFaceoff, firstPacked } = clockwiseExtras()
    expect([sprite.length, tapeChanges(sprite).size]).toEqual([96, 108])
    expect([fight.length, tapeChanges(fight).size]).toEqual([28, 38])
    expect([faceoff.length, tapeChanges(faceoff).size]).toEqual([22, 50])
    expect([firstFaceoff.length, tapeChanges(firstFaceoff).size]).toEqual([27, 81])
    // The toe-end tape only tapes where the first one did.
    const firstChanges = tapeChanges(firstFaceoff)
    for (const at of tapeChanges(faceoff).keys()) expect(firstChanges.has(at)).toBe(true)
    for (const list of [sprite, fight, faceoff, packed, firstFaceoff, firstPacked]) {
      list.forEach((t, i) => {
        expect(t.patched.length).toBe(t.original.length)
        expect(t.original).not.toEqual(t.patched)
        if (i > 0) expect(t.at).toBeGreaterThanOrEqual(list[i - 1].at + list[i - 1].original.length)
      })
    }
    // The fight frames lie in the fighting patch's frames, past Clockwise's records.
    expect(fight[0].at).toBeGreaterThan(clockwiseRecords().at(-1)!.at)
    // The untaped frames' tape is in the sprite tiles among Clockwise's records, but in none of them.
    for (const t of sprite) {
      expect(t.at).toBeGreaterThanOrEqual(0x5de84)
      for (const r of clockwiseRecords()) expect(t.at < r.at + r.original.length && r.at < t.at + t.original.length).toBe(false)
    }
  })

  it('unpacks plain tiles as they are, and refuses a stream that comes out short', () => {
    const plain = new Uint8Array(2 + 64).map((_, i) => i)
    plain.set([0x00, 0x02], 0)
    expect(unpackTiles(plain, 0)).toEqual({ tiles: plain.slice(2), packed: false, end: 66 })
    // One tile: 3 bytes as they are, 18 and then 11 copies of the one before, the end code.
    const packedOne = Uint8Array.from([0x80, 0x01, 0x02, 0x11, 0x22, 0x33, 0x80 | 15, 1, 0x80 | 8, 1, 0xe0, 0x00])
    const one = unpackTiles(packedOne, 0)!
    expect(one.packed).toBe(true)
    expect(one.end).toBe(packedOne.length)
    expect([...one.tiles]).toEqual([0x11, 0x22, ...new Array<number>(30).fill(0x33)])
    expect(unpackTiles(Uint8Array.from([0x80, 0x01, 0x02, 0x11, 0x22, 0x33, 0xe0, 0x00]), 0)).toBeNull()
  })
})

describe.skipIf(!existsSync(ORIGINAL))("NOSE4Web's additions on the original game", () => {
  it('finds the faceoff close-up from checkfo, and unpacks its 179 tiles up to its frames', () => {
    const rom = new Uint8Array(readFileSync(ORIGINAL))
    const anim = faceoffAnim(rom)!
    expect(anim).toBe(0xa78ae)
    expect((rom[anim + 8] << 8) | rom[anim + 9]).toBe(0x80b3)
    const unpacked = tilesOf(rom)
    expect(unpacked.packed).toBe(true)
    expect(unpacked.tiles.length).toBe(179 * 32)
    // The stream ends where the anim's frames begin (the long at +4).
    expect(unpacked.end).toBe(anim + ((rom[anim + 4] << 24) | (rom[anim + 5] << 16) | (rom[anim + 6] << 8) | rom[anim + 7]))
  })

  it.skipIf(!existsSync(path(CDL)))('unpacks the faceoff tiles to what the CDL ROM has plain', () => {
    const cdl = new Uint8Array(readFileSync(path(CDL)))
    expect(faceoffAnim(cdl)).toBe(0x11ea88)
    expect(tilesOf(cdl)).toEqual({ tiles: cdl.slice(CDL_TILES, CDL_TILES + 179 * 32), packed: false, end: CDL_TILES + 179 * 32 })
    expect(tilesOf(new Uint8Array(readFileSync(ORIGINAL))).tiles).toEqual(cdl.slice(CDL_TILES, CDL_TILES + 179 * 32))
  })

  it('tapes the faceoff close-up: its stream changes as listed and unpacks to exactly the listed changes, and out again', () => {
    const rom = openRom(new Uint8Array(readFileSync(ORIGINAL))).bytes
    const on = hackRom(rom, { ...NO_HACKS, clockwiseSprites: true })
    expect(on.length).toBe(rom.length)
    const anim = faceoffAnim(rom)!
    const { faceoff, packed } = clockwiseExtras()
    // In the stream: the listed changes and nothing else.
    const end = tilesOf(rom).end
    expect(changes(rom, on, anim, end)).toEqual(tapeChanges(packed, anim + 10))
    // Unpacked: MV's 50 bytes and nothing else.
    expect(changes(tilesOf(rom).tiles, tilesOf(on).tiles)).toEqual(tapeChanges(faceoff))
    expect(tilesOf(on).end).toBe(end)
    expect(detectHacks(on)).toEqual({ choices: { ...NO_HACKS, clockwiseSprites: true }, unknown: [] })
    expectSameBytes(hackRom(on, NO_HACKS), rom)
  })

  it('tapes the fight frames with the fighting patch in, in either order, and takes it all out again', () => {
    const rom = openRom(new Uint8Array(readFileSync(ORIGINAL))).bytes
    const all: HackChoices = { ...NO_HACKS, fighting: 'on', clockwiseSprites: true }
    const together = hackRom(rom, all)
    const fightOnly = hackRom(rom, { ...NO_HACKS, fighting: 'on' })
    const clockwiseOnly = hackRom(rom, { ...NO_HACKS, clockwiseSprites: true })
    expect(fightState(together)).toBe('on')
    expect(detectHacks(together)).toEqual({ choices: all, unknown: [] })
    // Against the fighting patch alone: Clockwise's records, the faceoff's stream and the fight frames' tape, as listed.
    const { sprite, fight, packed } = clockwiseExtras()
    const anim = faceoffAnim(rom)!
    const expected = new Map([...tapeChanges(sprite), ...tapeChanges(fight), ...tapeChanges(packed, anim + 10)])
    for (const r of clockwiseRecords()) r.original.forEach((byte, i) => byte !== r.patched[i] && expected.set(r.at + i, [byte, r.patched[i]]))
    expect(together.length).toBe(fightOnly.length)
    expect(changes(fightOnly, together)).toEqual(expected)
    // The fight frames' tape is in the patch's frames, so without fighting none of it goes in.
    expect(changes(rom, clockwiseOnly, fight[0].at, fight.at(-1)!.at + 8).size).toBe(0)
    // Either order, by itself in turn.
    expectSameBytes(withChoices(fightOnly, { clockwiseSprites: true }), together)
    expectSameBytes(withChoices(clockwiseOnly, { fighting: 'on' }), together)
    // Another menu start keeps the tape.
    expectSameBytes(withChoices(together, { fighting: 'arcade' }), hackRom(rom, { ...all, fighting: 'arcade' }))
    // Out: fighting alone, this alone, both.
    expectSameBytes(withChoices(together, { fighting: 'none' }), clockwiseOnly)
    expectSameBytes(withChoices(together, { clockwiseSprites: false }), fightOnly)
    expectSameBytes(hackRom(together, NO_HACKS), rom)
  })

  it('goes with head bleeding and the goalie stick fix besides, which leave the fight frames’ tape alone', () => {
    const rom = openRom(new Uint8Array(readFileSync(ORIGINAL))).bytes
    const all: HackChoices = { ...NO_HACKS, fighting: 'on', clockwiseSprites: true, headBleeding: true, goalieBladeFix: true }
    const together = hackRom(rom, all)
    expect(detectHacks(together)).toEqual({ choices: all, unknown: [] })
    for (const t of clockwiseExtras().fight) expect(together.subarray(t.at, t.at + t.patched.length)).toEqual(t.patched)
    expectSameBytes(withChoices(together, { headBleeding: false, goalieBladeFix: false }), hackRom(rom, { ...NO_HACKS, fighting: 'on', clockwiseSprites: true }))
    expectSameBytes(hackRom(together, NO_HACKS), rom)
  })

  it('leaves a ROM with Clockwise in and none of the tape as it is, and gives it the tape when the edit is turned on', () => {
    const rom = openRom(new Uint8Array(readFileSync(ORIGINAL))).bytes
    const all: HackChoices = { ...NO_HACKS, fighting: 'on', clockwiseSprites: true }
    const together = hackRom(rom, all)
    // As the editor made it before: Clockwise's records, no tape.
    const earlier = together.slice()
    const { sprite, fight, packed } = clockwiseExtras()
    const anim = faceoffAnim(rom)!
    for (const t of [...sprite, ...fight]) earlier.set(t.original, t.at)
    for (const t of packed) earlier.set(t.original, anim + 10 + t.at)
    expect(tally(earlier)).toEqual({ original: 0, patched: 3498, own: 0 })
    expect(detectHacks(earlier)).toEqual({ choices: all, unknown: [] })
    expect(hasNoseTape(earlier)).toBe(false)
    expectSameBytes(withChoices(earlier, {}), earlier)
    expectSameBytes(withChoices(withChoices(earlier, { clockwiseSprites: false }), { clockwiseSprites: true }), together)
    expectSameBytes(hackRom(earlier, NO_HACKS), rom)
  })
  it('replaces the first faceoff tape (whole blades) with the toe-end tape, and takes either out', () => {
    const rom = openRom(new Uint8Array(readFileSync(ORIGINAL))).bytes
    const on = hackRom(rom, { ...NO_HACKS, clockwiseSprites: true })
    const anim = faceoffAnim(rom)!
    const { packed, firstPacked, firstFaceoff } = clockwiseExtras()
    // As 15dfee5 made it: EA's stream with the first tape's changes.
    const first = on.slice()
    for (const t of packed) first.set(t.original, anim + 10 + t.at)
    for (const t of firstPacked) first.set(t.patched, anim + 10 + t.at)
    expect(changes(tilesOf(rom).tiles, tilesOf(first).tiles)).toEqual(tapeChanges(firstFaceoff))
    expect(detectHacks(first)).toEqual({ choices: { ...NO_HACKS, clockwiseSprites: true }, unknown: [] })
    expectSameBytes(withChoices(first, {}), on)
    expectSameBytes(hackRom(first, NO_HACKS), rom)
  })
})

describe.skipIf(!existsSync(path(CDL)))("NOSE4Web's additions on a league ROM with the faceoff tiles plain", () => {
  it('replaces the first faceoff tape there too, and takes either out', () => {
    const rom = open(CDL).bytes
    const same = withChoices(rom, {})
    const on = withChoices(rom, { clockwiseSprites: true })
    const { faceoff, firstFaceoff } = clockwiseExtras()
    const first = on.slice()
    for (const t of faceoff) first.set(t.original, CDL_TILES + t.at)
    for (const t of firstFaceoff) first.set(t.patched, CDL_TILES + t.at)
    expect(changes(same, first, CDL_TILES - 10, CDL_TILES + 179 * 32)).toEqual(tapeChanges(firstFaceoff, CDL_TILES))
    expectSameBytes(withChoices(first, {}).subarray(CDL_TILES - 10, CDL_TILES + 179 * 32), on.subarray(CDL_TILES - 10, CDL_TILES + 179 * 32))
    const off = withChoices(first, { clockwiseSprites: false })
    expectSameBytes(off.subarray(CDL_TILES - 10, CDL_TILES + 179 * 32), same.subarray(CDL_TILES - 10, CDL_TILES + 179 * 32))
  })

  it('changes the listed bytes of the faceoff tiles, and takes them out again', () => {
    const rom = open(CDL).bytes
    const same = withChoices(rom, {})
    const on = withChoices(rom, { clockwiseSprites: true })
    expect(changes(same, on, CDL_TILES - 10, CDL_TILES + 179 * 32)).toEqual(tapeChanges(clockwiseExtras().faceoff, CDL_TILES))
    // MV's ROM offsets, the first and the last.
    expect([on[0x11f78d], on[0x1200a2]]).toEqual([0x22, 0x22])
    expect(on[0x11f7ca + 2]).toBe(0x2e)
    const off = withChoices(on, { clockwiseSprites: false })
    expectSameBytes(off.subarray(CDL_TILES - 10, CDL_TILES + 179 * 32), same.subarray(CDL_TILES - 10, CDL_TILES + 179 * 32))
    expect(detectHacks(on).unknown).toEqual(detectHacks(rom).unknown)
  })
})

// ------------------------------------------------ the untaped frames' tape in league ROMs
// (NHL 94 EVO, which keeps its own stick colour in these frames, is left out: NOSE4Web's hacks are not offered for it.)
const spriteNames = leagueNames.filter((name) => !name.includes('EVO'))
describe.skipIf(spriteNames.length === 0)("NOSE4Web's tape in the frames Clockwise left untaped, in league ROMs", () => {
  it.each(spriteNames)('goes into %s only where the art is the original game’s, and out again', (name) => {
    const rom = new Uint8Array(readFileSync(path(name)))
    expect(hacksSupported(openRom(rom).game)).toBe(true)
    const { sprite } = clockwiseExtras()
    const inPlace = clockwiseRecords().filter((r) => is(rom, r.at, r.original) || is(rom, r.at, r.patched)).length * 2 >= clockwiseRecords().length
    // A tile the league redrew (one of Clockwise's records or one of these with neither its bytes before nor after) is
    // left alone.
    const own = new Set<number>()
    for (const r of clockwiseRecords()) if (!is(rom, r.at, r.original) && !is(rom, r.at, r.patched)) tilesOfRecord(r).forEach((t) => own.add(t))
    for (const t of sprite) if (!is(rom, t.at, t.original) && !is(rom, t.at, t.patched)) tilesOfRecord(t).forEach((x) => own.add(x))
    const goesIn = inPlace ? sprite.filter((t) => !tilesOfRecord(t).some((x) => own.has(x)) && is(rom, t.at, t.original)) : []
    const on = rom.slice()
    putClockwise(on)
    for (const t of sprite) {
      const want = goesIn.includes(t) ? t.patched : rom.subarray(t.at, t.at + t.original.length)
      expect(on.subarray(t.at, t.at + t.original.length)).toEqual(want)
    }
    expect(goesIn.length).toBeGreaterThan(90)
    // Out: each of them as it was.
    takeOutClockwise(on)
    for (const t of sprite) expect(on.subarray(t.at, t.at + t.original.length)).toEqual(rom.subarray(t.at, t.at + t.original.length))
  })
})
