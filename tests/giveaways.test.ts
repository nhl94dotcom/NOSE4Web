import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, giveawaysOutdated, NO_HACKS, type HackChoices } from '../src/core/hacks'
import { buildRom, openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['nhl94.bin', ...(local.league30Rom ? [local.league30Rom] : []), ...(local.otherRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const u32 = (b: Uint8Array, o: number) => ((u16(b, o) << 16) | u16(b, o + 2)) >>> 0
// A 1 MB ROM grows to 2 MB with the counts and their pages (the room at its end is too little for both), and stays so
// when they come out: the ROM as it was, grown.
const grown = (rom: ReturnType<typeof open>, length: number) => {
  const bytes = new Uint8Array(Math.max(length, rom.bytes.length)).fill(0xff)
  bytes.set(rom.bytes)
  return { ...rom, bytes }
}
// NOSE4Web's giveaways code of 14 November 2026 (dbc898a), before the tables.
const EARLIER_GT =
  '6000001e600000f4600000fe6000011e6000012e6000015060000154600000fc302a005231c0b7aa48e7e0c008380004c2ea667808380000c2fa666408380004c2f0665c3238e8006b56ef4941f8b04ad0c114280062122a0062b30208020006673e3238e8020c41fffe67284a416b2aef4943f8b04ad2c14a690034671c14290062102a0062b10208020006660c74026120600c4a6a0034670622487400611231ea0052e80031fcffffe8024cdf03074e757000102900666b3e0c000020643808290006006267040640002041f8e8104a42670441f8e8500c3000ff000067045230000041f8e900082900060062670441f8ec64527020004e7531e80052beda31ea0052e8024e7550f8b7aa31eb0052e80208380004c2ea4e7550f8b7aa177c0010005e31fcfffee8024e7508f80004c2ee31fcffffe80031fcffffe8024e754278c4724278c5dc21fcffffffffe80041f8e810701f429851c8fffc42b8e90042b8ec644e757c0f43fafffc4e753c3c000b43fafffa4e75'
// NOSE4Web's giveaways code of 15 November 2026 (7ad4a23), before the tables.
const EARLIER_GT_15 =
  '6000001e60000100600001106000013660000146600001686000016c60000114302a005231c0b7aa48e7e0c008380004c2ea6600008808380000c2fa666c08380004c2f066643238e8006b5eef4941f8b04ad0c114280062122a0062b3020802000667463238e8020c41fffe672c4a416b2eef4943f8b04ad2c14a690034672014290062102a0062b1020802000666101038e8057402612a60104a6a0034670a22481038e8047400611831ea0052e80011ea0066e80431fcffffe8024cdf03074e75024000ff0c400020643808290006006267040640002041f8e8104a42670441f8e8500c3000ff000067045230000041f8e900082900060062670441f8ec64527020004e7531e80052beda31ea0052e80211ea0066e8054e7550f8b7aa31eb0052e80211eb0066e80508380004c2ea4e7550f8b7aa177c0010005e31fcfffee8024e7508f80004c2ee31fcffffe80031fcffffe8024e754278c4724278c5dc21fcffffffffe80041f8e810701f429851c8fffc42b8e90042b8ec644e757c0f43fafffc4e753c3c000b43fafffa4e75'

// NOSE4Web's giveaways code of 18 November 2026 (bfda480), before the tables: a pass at the net forgotten as released.
const EARLIER_GT_18 =
  '6000002660000108600001186000013e6000014e60000170600001746000011c6000017660000188302a005231c0b7aa48e7e0c008380004c2ea6600008808380000c2fa666c08380004c2f066643238e8006b5eef4941f8b04ad0c114280062122a0062b3020802000667463238e8020c41fffe672c4a416b2eef4943f8b04ad2c14a690034672014290062102a0062b1020802000666101038e8057402612a60104a6a0034670a22481038e8047400611831ea0052e80011ea0066e80431fcffffe8024cdf03074e75024000ff0c400020643808290006006267040640002041f8e8104a42670441f8e8500c3000ff000067045230000041f8e900082900060062670441f8ec64527020004e7531e80052beda31ea0052e80211ea0066e8054e7550f8b7aa31eb0052e80211eb0066e80508380004c2ea4e7550f8b7aa177c0010005e31fcfffee8024e7508f80004c2ee31fcffffe80031fcffffe8024e754278c4724278c5dc21fcffffffffe80041f8e810701f429851c8fffc42b8e90042b8ec644e757c0f43fafffc4e753c3c000b43fafffa4e7508b80002c2f40c78fffee802660631fcffffe8004e753238b7743038b75e082b000700626604444044410c4000586d2e4a416f2a0440010844400c4000146d1ec1f8b77281c16916d078b74a064000280c400050620821fcffffffffe8003038b7723238b7744e75'

// NOSE4Web's later giveaways code of 18 November 2026 (1d24880), before the tables: a pickup after the whistle counted.
const EARLIER_GT_18B =
  '6000003260000114600001246000014a6000015a6000017c60000180600001286000018260000194600001e86000020e60000240302a005231c0b7aa48e7e0c008380004c2ea6600008808380000c2fa666c08380004c2f066643238e8006b5eef4941f8b04ad0c114280062122a0062b3020802000667463238e8024a416a06464167306028ef4943f8b04ad2c14a690034672014290062102a0062b1020802000666101038e8057402612a60104a6a0034670a22481038e8047400611831ea0052e80011ea0066e80431fcffffe8024cdf03074e75024000ff0c400020643808290006006267040640002041f8e8104a42670441f8e8500c3000ff000067045230000041f8e900082900060062670441f8ec64527020004e7531e80052beda31ea0052e80211ea0066e8054e7550f8b7aa31eb0052e80211eb0066e80508380004c2ea4e7550f8b7aa177c0010005e31fcfffee8024e7508f80004c2ee31fcffffe80031fcffffe8024e754278c4724278c5dc21fcffffffffe80041f8e810701f429851c8fffc42b8e90042b8ec644e757c0f43fafffc4e753c3c000b43fafffa4e7508b80002c2f40c78fffee802660631fcffffe8004e753238b7743038b75e082b000700626604444044410c4000586d344a416f300440010844400c4000146d24c1f8b77281c1691cd078b74a064000280c400050620e70fd4a78b75e6a02534031c0e8023038b7723238b7744e7531d2bf7c31ea0014bf7e4a6a003466180c78fffde80267080c78fffce802660821fcffffffffe8004e754eb9000102460c78fffde802660a0c780108b75e6c1260180c78fffce80266100c78fef8b75e6e0821fcffffffffe8004ef90000ffea50f8bfa061aa0c6b000d00244e75'

describe.skipIf(!existsSync(path('nhl94.bin')))('giveaways and takeaways (Genesis)', () => {
  it('counts at puckglue, learns why at the steals, FallDown and doshot, clears at StartGame, and adds the Game Stats row', () => {
    const rom = open('nhl94.bin')
    expect(detectHacks(rom.bytes).choices.giveaways).toBe(false)
    const on = applyHacks(rom, { ...NO_HACKS, giveaways: true }).bytes
    const base = u32(on, 0x15288 + 2)
    const entries: [number, number][] = [[0x15288, 0], [0x151bc, 4], [0x15548, 4], [0x143fa, 8], [0xc340, 0xc], [0x77b8, 0x10], [0xfde5e, 0x14], [0xfde6c, 0x18], [0xbc6e, 0x1c], [0x154ee, 0x20], [0xbdd8, 0x24], [0x1013e, 0x28], [0xff86, 0x2c], [0x14664, 0x30]]
    for (const [at, entry] of entries) {
      expect(u16(on, at)).toBe(0x4eb9)
      expect(u32(on, at + 2)).toBe(base + entry)
    }
    expect(u16(on, 0xfdcbc)).toBe(0x80)
    expect(u16(on, 0xfdcca)).toBe(0x40)
    // puckglue's own two instructions first.
    expect(hex(on, base + 0x34, 8)).toBe('302a005231c0b7aa')
    // From the whistle to the end of the ref's sequence (gmpen, gmode bit 2): a pickup is not counted, the carrier and
    // the cause forgotten (puckglue's own two moves, then move.l #-1,(LASTC).w); else on to the count.
    expect(base + 2 + u16(on, base + 2)).toBe(base + 0x280)
    expect(hex(on, base + 0x280, 0x1c)).toBe('08380002c2ea 6700fdac 302a0052 31c0b7aa 21fcffffffffe800 4e75'.replace(/ /g, ''))
    // The cause: from $FFFC (a pass, the pass at the net's two marks too), the other team's skater picking it up a
    // giveaway; $FFFF (none), a giveaway whoever picks it up; else the forcer's spot.
    expect(hex(on, base + 0x78, 14)).toBe('3238e8024a416a06464167306028')
    // TBLA: moveq #$F,d6 / lea (pc) to the table after the code: Score first, Give/Takeaways last.
    expect(hex(on, base + 0x192, 2)).toBe('7c0f')
    const table = base + 0x196 + u16(on, base + 0x196)
    expect(table).toBe(base + 0x2b0)
    expect(hex(on, table, 7)).toBe('000853636f7265')
    const text = Buffer.from(on.subarray(base, base + 0x500)).toString('latin1')
    expect(text.split('Give/Takeaways').length).toBe(3)
    expect(hex(on, base + 0x19a, 4)).toBe('3c3c000b')
    // The goalie's touch (Match Viewer's code): bclr #2,(sflags4).w, then a pass's carrier forgotten.
    expect(hex(on, base + 0x20, 2)).toBe('6000')
    expect(base + 0x22 + u16(on, base + 0x22)).toBe(base + 0x1a4)
    expect(hex(on, base + 0x1a4, 22)).toBe('08b80002c2f40c78fffee802660631fcffffe8004e75')
    // The pass at the net, at dopass's .notgoalie: in the attacking zone, 20 or more in front of the goal line, its
    // line crossing it within 40 of the middle, marked: the cause $FFFD at the top's net (the puck's y positive),
    // $FFFC at the bottom's, the passer kept; then dopass's own two moves.
    expect(base + 0x26 + u16(on, base + 0x26)).toBe(base + 0x1ba)
    expect(hex(on, base + 0x1ba, 0x58)).toBe(
      '3238b774 3038b75e 082b00070062 6604 4440 4441 0c400058 6d34 4a41 6f30 04400108 4440 0c400014 6d24 c1f8b772 81c1 691c d078b74a 06400028 0c400050 620e 70fd 4a78b75e 6a02 5340 31c0e802 3038b772 3238b774 4e75'.replace(/ /g, ''),
    )
    // A goalie's touch (a2touchpuck's own two moves, then position(a2) 0) forgets the passer of a pass at the net.
    expect(base + 0x2a + u16(on, base + 0x2a)).toBe(base + 0x212)
    expect(hex(on, base + 0x212, 0x2a)).toBe('31d2bf7c 31ea0014bf7e 4a6a0034 6618 0c78fffde802 6708 0c78fffce802 6608 21fcffffffffe800 4e75'.replace(/ /g, ''))
    // Each frame of pucknorm (PuckIChk, then ChkOffsides): the carrier and the cause forgotten from the whistle to the
    // end of the ref's sequence, then on; a pass at the net that has reached its goal line forgotten.
    expect(base + 0x2e + u16(on, base + 0x2e)).toBe(base + 0x29c)
    expect(hex(on, base + 0x29c, 0x14)).toBe('08380002c2ea 6708 21fcffffffffe800 6000ff8e'.replace(/ /g, ''))
    expect(base + 0x2ae + u16(on, base + 0x2ae) - 0x10000).toBe(base + 0x23c)
    expect(hex(on, base + 0x23c, 0x36)).toBe(
      '4eb900010246 0c78fffde802 660a 0c780108b75e 6c12 6018 0c78fffce802 6610 0c78fef8b75e 6e08 21fcffffffffe800 4ef90000ffea'.replace(/ /g, ''),
    )
    // The puck touching a net below its crossbar (checkgoal's st (collflag).w, then bsr to the goalie's test, then its
    // own cmpi.w #$D,OldZpos(a3)): a pass at the net forgotten.
    expect(base + 0x32 + u16(on, base + 0x32)).toBe(base + 0x272)
    expect(hex(on, base + 0x272, 0xe)).toBe('50f8bfa0 61aa 0c6b000d0024 4e75'.replace(/ /g, ''))
    // The carrier's and the forcer's roster places kept as they get or force the puck: move.b pnum(a2),(LASTP).w at
    // the pickup, pnum(a2) / pnum(a3) to CAUSEP at the steal and FallDown.
    const code = hex(on, base, 0x2b0)
    expect(code).toContain('11ea0066e804')
    expect(code).toContain('11ea0066e805')
    expect(code).toContain('11eb0066e805')
    expect(detectHacks(on).choices).toEqual({ ...NO_HACKS, giveaways: true })
    expect(on.length).toBe(0x200000)
    expect(Buffer.compare(buildRom(applyHacks(openRom(buildRom({ ...rom, bytes: on })), NO_HACKS)), buildRom(grown(rom, on.length)))).toBe(0)
  })

  it('adds the Giveaways and Takeaways pages to Player Stats, with or without Time On Ice', () => {
    const rom = open('nhl94.bin')
    const sites = [0x9556, 0x968a, 0x9658, 0x9878, 0x97ce]
    const text = (b: Uint8Array, at: number) => Buffer.from(b.subarray(at, at + 0x240)).toString('latin1')
    for (const timeOnIce of [false, true]) {
      const on = applyHacks(rom, { ...NO_HACKS, giveaways: true, timeOnIce }).bytes
      const base = u32(on, sites[0] + 2)
      sites.forEach((at, i) => {
        expect(u16(on, at)).toBe(0x4eb9)
        expect(u32(on, at + 2)).toBe(base + 4 * i)
      })
      // The page bounds: up to 6, or 7 with the time on ice.
      expect(hex(on, base + 0x14 + 10, 4)).toBe(timeOnIce ? '0c400007' : '0c400006')
      const pages = text(on, base)
      expect(pages).toContain('[    Giveaways     ]')
      expect(pages).toContain(timeOnIce ? '[    Takeaways     ]' : '[    Takeaways      ')
      expect(pages.includes('Time On Ice')).toBe(timeOnIce)
      expect(detectHacks(on).choices).toEqual({ ...NO_HACKS, giveaways: true, timeOnIce })
      // Off again: the game's code, byte for byte, or the time on ice page's own (which detection checks byte for byte).
      const off = openRom(buildRom(applyHacks(openRom(buildRom({ ...rom, bytes: on })), { ...NO_HACKS, timeOnIce })))
      expect(detectHacks(off.bytes).choices).toEqual({ ...NO_HACKS, timeOnIce })
      if (!timeOnIce) expect(Buffer.compare(buildRom(off), buildRom(grown(rom, off.bytes.length)))).toBe(0)
    }
    // Giveaways on a ROM that has the time on ice page: the pages' code takes its places over.
    const toi = openRom(buildRom(applyHacks(rom, { ...NO_HACKS, timeOnIce: true })))
    const both = buildRom(applyHacks(toi, { ...NO_HACKS, timeOnIce: true, giveaways: true }))
    expect(detectHacks(openRom(both).bytes).choices).toEqual({ ...NO_HACKS, timeOnIce: true, giveaways: true })
    // And off again: the time on ice page alone, as the time on ice hack has it.
    expect(detectHacks(applyHacks(openRom(both), { ...NO_HACKS, timeOnIce: true }).bytes).choices).toEqual({ ...NO_HACKS, timeOnIce: true })
  })

  it('knows a ROM from the version without the pages, and adds them when applied again', () => {
    const rom = open('nhl94.bin')
    // The counts, and the game's own code at the five places.
    const counts = applyHacks(rom, { ...NO_HACKS, giveaways: true }).bytes.slice()
    for (const at of [0x9556, 0x968a, 0x9658, 0x9878, 0x97ce]) counts.set(rom.bytes.subarray(at, at + 16), at)
    expect(detectHacks(counts).choices).toEqual({ ...NO_HACKS, giveaways: true })
    const again = applyHacks(openRom(buildRom({ ...rom, bytes: counts })), { ...NO_HACKS, giveaways: true }).bytes
    expect(u16(again, 0x9556)).toBe(0x4eb9)
    expect(detectHacks(again).choices).toEqual({ ...NO_HACKS, giveaways: true })
  })

  // A ROM with an earlier version: its code (`body`, its tables' lea (pc) extension words at `tableA` and `tableB`),
  // then the same tables; the places it had no hook at (`missing`) as the game has them.
  const earlierRom = (rom: ReturnType<typeof open>, body: Buffer, tableA: number, tableB: number, missing = [0x154ee, 0xbdd8, 0x1013e, 0xff86, 0x14664]) => {
    const on = applyHacks(rom, { ...NO_HACKS, giveaways: true }).bytes
    const base = u32(on, 0x15288 + 2)
    const secondTable = 0x1a0 + u16(on, base + 0x1a0)
    // The end: past the second Give/Takeaways row (its label, then two offsets).
    const end = Buffer.from(on).indexOf('Give/Takeaways', base + secondTable, 'latin1') + 14 + 4
    const tables = on.slice(base + 0x2b0, end)
    const earlier = on.slice()
    earlier.fill(0xff, base, end)
    earlier.set(body, base)
    earlier.set(tables, base + body.length)
    earlier[base + tableA] = (body.length - tableA) >> 8
    earlier[base + tableA + 1] = (body.length - tableA) & 0xff
    const b = secondTable - 0x2b0 + body.length - tableB
    earlier[base + tableB] = b >> 8
    earlier[base + tableB + 1] = b & 0xff
    for (const at of missing) earlier.set(rom.bytes.subarray(at, at + 10), at)
    return earlier
  }

  it('knows the version of 14 November, which counted whoever held the spot, and replaces it when applied again', () => {
    const rom = open('nhl94.bin')
    // That version: its 376 bytes of code (lea (pc) extension words at $16A and $174).
    const earlier = earlierRom(rom, Buffer.from(EARLIER_GT, 'hex'), 0x16a, 0x174)
    expect(detectHacks(earlier).choices).toEqual({ ...NO_HACKS, giveaways: true })
    expect(detectHacks(earlier).unknown).toEqual([])
    const again = applyHacks(openRom(buildRom({ ...rom, bytes: earlier })), { ...NO_HACKS, giveaways: true }).bytes
    expect(hex(again, u32(again, 0x15288 + 2), 0x2b0)).toContain('11ea0066e804')
    expect(Buffer.compare(buildRom({ ...rom, bytes: again }), buildRom(applyHacks(rom, { ...NO_HACKS, giveaways: true })))).toBe(0)
    expect(Buffer.compare(buildRom(applyHacks(openRom(buildRom({ ...rom, bytes: earlier })), NO_HACKS)), buildRom(grown(rom, earlier.length)))).toBe(0)
  })

  it('knows the version of 15 November, without the pass at the net, and replaces it when applied again', () => {
    const rom = open('nhl94.bin')
    // That version: its 400 bytes of code (lea (pc) extension words at $182 and $18C), nine hooks.
    const earlier = earlierRom(rom, Buffer.from(EARLIER_GT_15, 'hex'), 0x182, 0x18c)
    // The page offers to put in the current version; a ROM with it, or without the hack, is not offered it.
    expect(giveawaysOutdated(earlier)).toBe(true)
    expect(giveawaysOutdated(applyHacks(rom, { ...NO_HACKS, giveaways: true }).bytes)).toBe(false)
    expect(giveawaysOutdated(rom.bytes)).toBe(false)
    expect(u16(earlier, 0x154ee)).toBe(0x08b8)
    expect(u16(earlier, 0xbdd8)).toBe(0x3038)
    expect(detectHacks(earlier).choices).toEqual({ ...NO_HACKS, giveaways: true })
    expect(detectHacks(earlier).unknown).toEqual([])
    const again = applyHacks(openRom(buildRom({ ...rom, bytes: earlier })), { ...NO_HACKS, giveaways: true }).bytes
    expect(Buffer.compare(buildRom({ ...rom, bytes: again }), buildRom(applyHacks(rom, { ...NO_HACKS, giveaways: true })))).toBe(0)
    expect(u16(again, 0x154ee)).toBe(0x4eb9)
    expect(u16(again, 0xbdd8)).toBe(0x4eb9)
    // Off: the game, byte for byte.
    expect(Buffer.compare(buildRom(applyHacks(openRom(buildRom({ ...rom, bytes: earlier })), NO_HACKS)), buildRom(grown(rom, earlier.length)))).toBe(0)
  })

  it('knows the version of 18 November, which forgot a pass at the net as it was released, and replaces it when applied again', () => {
    const rom = open('nhl94.bin')
    // That version: its 512 bytes of code (lea (pc) extension words at $18A and $194), eleven hooks.
    const earlier = earlierRom(rom, Buffer.from(EARLIER_GT_18, 'hex'), 0x18a, 0x194, [0x1013e, 0xff86, 0x14664])
    expect(giveawaysOutdated(earlier)).toBe(true)
    expect(u16(earlier, 0x154ee)).toBe(0x4eb9)
    expect(u16(earlier, 0xbdd8)).toBe(0x4eb9)
    expect(u16(earlier, 0x1013e)).toBe(0x31d2)
    expect(u16(earlier, 0xff86)).toBe(0x6100)
    expect(u16(earlier, 0x14664)).toBe(0x50f8)
    expect(detectHacks(earlier).choices).toEqual({ ...NO_HACKS, giveaways: true })
    expect(detectHacks(earlier).unknown).toEqual([])
    const again = applyHacks(openRom(buildRom({ ...rom, bytes: earlier })), { ...NO_HACKS, giveaways: true }).bytes
    expect(Buffer.compare(buildRom({ ...rom, bytes: again }), buildRom(applyHacks(rom, { ...NO_HACKS, giveaways: true })))).toBe(0)
    expect(giveawaysOutdated(again)).toBe(false)
    expect(u16(again, 0x1013e)).toBe(0x4eb9)
    expect(u16(again, 0xff86)).toBe(0x4eb9)
    expect(u16(again, 0x14664)).toBe(0x4eb9)
    // Off: the game, byte for byte.
    expect(Buffer.compare(buildRom(applyHacks(openRom(buildRom({ ...rom, bytes: earlier })), NO_HACKS)), buildRom(grown(rom, earlier.length)))).toBe(0)
  })

  it('knows the later version of 18 November, which counted a pickup after the whistle, and replaces it when applied again', () => {
    const rom = open('nhl94.bin')
    // That version: its 640 bytes of code (lea (pc) extension words at $196 and $1A0), all fourteen hooks.
    const earlier = earlierRom(rom, Buffer.from(EARLIER_GT_18B, 'hex'), 0x196, 0x1a0, [])
    expect(giveawaysOutdated(earlier)).toBe(true)
    expect(detectHacks(earlier).choices).toEqual({ ...NO_HACKS, giveaways: true })
    expect(detectHacks(earlier).unknown).toEqual([])
    const again = applyHacks(openRom(buildRom({ ...rom, bytes: earlier })), { ...NO_HACKS, giveaways: true }).bytes
    expect(Buffer.compare(buildRom({ ...rom, bytes: again }), buildRom(applyHacks(rom, { ...NO_HACKS, giveaways: true })))).toBe(0)
    expect(giveawaysOutdated(again)).toBe(false)
    // Off: the game, byte for byte.
    expect(Buffer.compare(buildRom(applyHacks(openRom(buildRom({ ...rom, bytes: earlier })), NO_HACKS)), buildRom(grown(rom, earlier.length)))).toBe(0)
  })

  it('has its five newer places to itself, with every other hack on', () => {
    const rom = open('nhl94.bin')
    const all: HackChoices = {
      ...NO_HACKS,
      weightFix: 'on', bodychecks: 'on', secondAssist: true, oneTimerAssist: true, regainAssist: true, plusMinus: true, wideRatings: true, bonuses: 'disabled',
      threeStars: 'linesOn', baseWeight: 144, checkFix: 'all120', aggressionFix: true, ppPkFix: true, comebackFix: true,
      passFix: true, openNetFix: true, repeatCheckFix: true, fighting: 'arcade', faceoffFix: true, runawayFix: true, penaltyShotTableFix: true, penaltyShotFixes: true,
      goaliePullFix: true, blindRingFix: true, snipingFix: true, awarenessFix: true, crowdFix: true, stickShots: true,
      goalieHold: 0, goalieWidth: 40, goalieOut: 224, goalieLine: 144, stamina: true, energyDrain: 65,
      energyRecovery: 6, noSkatingDrain: true, burstEnergy: 0, speedBurst: 24, turnRate: 300, realTime: true, injuries: 'period', hotColdRange: 4, hybridIcing: true, delayedCalls: true, threeOnThree: 'season', bCheckPenaltiesOff: 'asPenaltiesOn', goalieDelay: 12, fewerSkaterLines: 32, introWait: 20, puckFriction: 8, puckColours: 'home', netColours: 'crowd', greenFan: true, barrPick: true, fourthPeriodOvertime: 5940, seasonTies: 'overtime', anyPosition: true, hitEnergy: 204, holdEnergy: 102, injuryBonus: 2, injuryCap: 12, headBleeding: true, penaltySeconds: 30, fightSeconds: 150, shootoutInjuries: true, nhlShootout: true, choppyIce: true, clutchTime: true, timeOnIce: true, organResume: true,
    }
    const others = applyHacks(rom, all)
    for (const at of [0x154ee, 0xbdd8, 0x1013e, 0xff86, 0x14664]) expect(hex(others.bytes, at, 10)).toBe(hex(rom.bytes, at, 10))
    const on = applyHacks(openRom(buildRom(others)), { ...all, giveaways: true })
    expect(detectHacks(on.bytes)).toEqual({ choices: { ...all, giveaways: true }, unknown: [] })
    const off = applyHacks(openRom(buildRom(on)), all)
    expect(detectHacks(off.bytes)).toEqual({ choices: all, unknown: [] })
    for (const at of [0x154ee, 0xbdd8, 0x1013e, 0xff86, 0x14664]) expect(hex(off.bytes, at, 10)).toBe(hex(rom.bytes, at, 10))
  })

  it("goes with time on ice, the injury risk, hit energy and chaos's fighting patch", () => {
    const rom = open('nhl94.bin')
    const all = { ...NO_HACKS, giveaways: true, timeOnIce: true, injuryBonus: 2, injuryCap: 10, hitEnergy: 204, holdEnergy: 102, fighting: 'on' as const, bodychecks: 'on' as const }
    const on = applyHacks(rom, all)
    expect(detectHacks(on.bytes).choices).toMatchObject({ giveaways: true, timeOnIce: true, fighting: 'on', bodychecks: 'on' })
    const off = applyHacks(openRom(buildRom(on)), { ...all, giveaways: false })
    expect(detectHacks(off.bytes).choices.giveaways).toBe(false)
  })

  names.forEach((name) => {
    it(`${name}: goes in and comes out`, () => {
      const rom = open(name)
      const state = detectHacks(rom.bytes)
      // Not for the EVO builds, whose code is their own.
      if (name.includes('EVO')) {
        expect(state.unknown).toContain('giveaways')
        return
      }
      expect(state.unknown).not.toContain('giveaways')
      const on = openRom(buildRom(applyHacks(rom, { ...state.choices, giveaways: true })))
      expect(detectHacks(on.bytes).choices).toEqual({ ...state.choices, giveaways: true })
      const off = applyHacks(on, state.choices)
      expect(Buffer.compare(buildRom(off), buildRom(grown(applyHacks(rom, state.choices), off.bytes.length)))).toBe(0)
    })
  })
})
