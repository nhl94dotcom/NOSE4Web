import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readU16, readU32 } from '../src/core/bytes'
import { detectHacks, FACEOFF_CODE, hackRom, NO_HACKS } from '../src/core/hacks'
import { openRom } from '../src/core/rom'
import { loRomOffset } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks, relocatedSnesHack, snesFaceoffCode } from '../src/core/sneshacks'

// The faceoff spot fix's new code, run by small interpreters of the 68000 and
// the 65816 that decode the instructions it uses from their bit fields, and
// checked against the rules it is meant to follow.

const s8 = (v: number) => ((v & 0xff) ^ 0x80) - 0x80
const s16 = (v: number) => ((v & 0xffff) ^ 0x8000) - 0x8000

// Where the faceoff should be: a goal at centre; a penalty in the offending
// team's own end; past a blue line that end's dot, else the nearest neutral
// dot; x at the dot on the side of the raw x.
function meant(code: number, x: number, y: number, ownEndBottom: boolean, penalties: [number, number]): [number, number] {
  if (code === 0x0e) return [0, 0]
  if (code >= penalties[0] && code <= penalties[1]) y = ownEndBottom ? -206 : 206
  const fx = x < 0 ? -70 : 70
  const fy = y > 88 ? 206 : y < -88 ? -206 : y < 0 ? -65 : 65
  return [fx, fy]
}

function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

// Raw spots worth trying: the edges of each zone, icing's +-600, and random ones.
function cases(): { code: number; x: number; y: number; bottom: boolean; player: number }[] {
  const random = seeded(206)
  const ys = [0, 1, -1, 64, 65, 88, 89, -88, -89, 165, 166, -166, 600, -600, 206, -206]
  const xs = [0, 1, -1, 70, -70, 130, -130]
  const out: { code: number; x: number; y: number; bottom: boolean; player: number }[] = []
  for (let code = 2; code <= 0x40; code += 2) {
    for (const y of ys) for (const x of xs) out.push({ code, x, y, bottom: (x + y) % 3 === 0, player: (code / 2) % 12 })
  }
  for (let i = 0; i < 3000; i++) {
    out.push({
      code: 2 * Math.floor(random() * 32),
      x: Math.floor(random() * 400) - 200,
      y: Math.floor(random() * 1400) - 700,
      bottom: random() < 0.5,
      player: Math.floor(random() * 12) | (random() < 0.3 ? 0x80 : 0),
    })
  }
  return out
}

// ------------------------------------------------------------------ 68000

const FOX = 0xffffbf94
const SORT_CORDS = 0xffffb04a
const ENTRY = 0xffffc3a6

function runGenesis(code: Uint8Array, d0: number, d1: number, entryCode: number, player: number, ownEndBottom: boolean) {
  const memory = new Map<number, number>()
  const byte = (at: number) => memory.get(at >>> 0) ?? 0
  const setByte = (at: number, v: number) => memory.set(at >>> 0, v & 0xff)
  // The PenBuf entry before a0, and the player's pflags byte with its pfgoal bit (7).
  setByte(ENTRY - 2, entryCode)
  setByte(ENTRY - 1, player)
  setByte(SORT_CORDS + (player & 0x7f) * 128 + 0x62, ownEndBottom ? 0x80 : 0x00)
  const d = [d0 & 0xffff, d1 & 0xffff, 0x1234, 0x5678, 0, 0, 0, 0]
  const a = [ENTRY, 0xabcd, 0, 0, 0, 0, 0, 0xffff8000]
  let [n, z, c, v] = [false, false, false, false]
  const word = (at: number) => readU16(code, at)
  const setW = (r: number, value: number) => (d[r] = ((d[r] & 0xffff0000) | (value & 0xffff)) >>> 0)
  const nz = (value: number) => {
    n = value < 0
    z = value === 0
    c = false
    v = false
  }
  const compare = (a1: number, b1: number, bits: 8 | 16) => {
    const mask = bits === 8 ? 0xff : 0xffff
    const sign = bits === 8 ? s8 : s16
    const result = sign(a1 - b1)
    n = result < 0
    z = result === 0
    c = (a1 & mask) < (b1 & mask)
    v = (sign(a1) - sign(b1)) !== result
  }
  const condition = (cc: number) =>
    ({ 0: true, 4: !c, 5: c, 6: !z, 7: z, 0xb: n, 0xd: n !== v, 0xe: !z && n === v } as Record<number, boolean>)[cc] ??
    (() => {
      throw new Error(`condition ${cc}`)
    })()
  let pc = 0
  for (let steps = 0; steps < 200; steps++) {
    const at = pc
    const op = word(at)
    pc += 2
    const reg = op & 7
    const high = (op >> 9) & 7
    if (op === 0x4e75) return { x: s16(d[0]), y: s16(d[1]), fox: s16((byte(FOX) << 8) | byte(FOX + 1)), foy: s16((byte(FOX + 2) << 8) | byte(FOX + 3)), d, a }
    if ((op & 0xfff8) === 0x0c28) {
      // cmpi.b #imm,d16(An)
      const immediate = word(pc) & 0xff
      const at2 = (a[reg] + s16(word(pc + 2))) >>> 0
      pc += 4
      compare(byte(at2), immediate, 8)
    } else if ((op & 0xf000) === 0x6000 && (op & 0xff) !== 0) {
      if (condition((op >> 8) & 0xf)) pc = at + 2 + s8(op)
    } else if (op === 0x2f09) {
      a[7] = (a[7] - 4) >>> 0
      for (let i = 0; i < 4; i++) setByte(a[7] + i, a[1] >>> (24 - 8 * i))
    } else if (op === 0x225f) {
      a[1] = (((byte(a[7]) << 24) | (byte(a[7] + 1) << 16) | (byte(a[7] + 2) << 8) | byte(a[7] + 3)) >>> 0)
      a[7] = (a[7] + 4) >>> 0
    } else if ((op & 0xf1ff) === 0x307c) {
      a[high] = s16(word(pc)) >>> 0
      pc += 2
    } else if ((op & 0xfff8) === 0x4240) {
      setW(reg, 0)
      nz(0)
    } else if ((op & 0xf1f8) === 0x1028) {
      // move.b d16(An),Dn
      const value = byte((a[reg] + s16(word(pc))) >>> 0)
      pc += 2
      d[high] = ((d[high] & 0xffffff00) | value) >>> 0
      nz(s8(value))
    } else if ((op & 0xfff8) === 0x0240) {
      setW(reg, d[reg] & word(pc))
      pc += 2
      nz(s16(d[reg]))
    } else if ((op & 0xf1f8) === 0xe140) {
      // asl.w #count,Dn
      const count = high === 0 ? 8 : high
      setW(reg, d[reg] << count)
      nz(s16(d[reg]))
    } else if ((op & 0xfff8) === 0x0830) {
      // btst #imm,d8(An,Xn.w)
      const bit = word(pc) & 7
      const extension = word(pc + 2)
      pc += 4
      const index = s16(d[(extension >> 12) & 7])
      z = ((byte((a[reg] + index + s8(extension)) >>> 0) >> bit) & 1) === 0
    } else if ((op & 0xf1ff) === 0x303c) {
      setW(high, word(pc))
      pc += 2
      nz(s16(d[high]))
    } else if ((op & 0xfff8) === 0x4a40) {
      nz(s16(d[reg]))
    } else if ((op & 0xf100) === 0x7000) {
      d[high] = s8(op) >>> 0
      nz(s8(op))
    } else if ((op & 0xf1ff) === 0xb07c) {
      compare(d[high] & 0xffff, word(pc), 16)
      pc += 2
    } else if ((op & 0xfff8) === 0x31c0) {
      const to = s16(word(pc)) >>> 0
      pc += 2
      setByte(to, d[reg] >> 8)
      setByte(to + 1, d[reg])
    } else {
      throw new Error(`68000 opcode ${op.toString(16)} at ${at} is not in the interpreter`)
    }
  }
  throw new Error('runs away')
}

describe('the faceoff spot fix, Genesis', () => {
  it('puts every faceoff on the dot the rules give', () => {
    for (const t of cases()) {
      const out = runGenesis(FACEOFF_CODE, t.x, t.y, t.code, t.player, t.bottom)
      const want = meant(t.code, t.code === 0x0e ? 0 : t.x, t.code === 0x0e ? 0 : t.y, t.bottom, [0x12, 0x2a])
      const raw = t.code === 0x0e ? [0, 0] : [t.x, t.y]
      if (t.code === 0x0e) {
        const goal = runGenesis(FACEOFF_CODE, 0, 0, 0x0e, t.player, t.bottom)
        expect([goal.fox, goal.foy]).toEqual([0, 0])
        continue
      }
      expect([out.fox, out.foy], JSON.stringify({ ...t, raw })).toEqual(want)
      // It leaves the registers the game uses afterwards as they were.
      expect([out.d[2], out.d[3], out.a[0], out.a[1], out.a[7]]).toEqual([0x1234, 0x5678, ENTRY, 0xabcd, 0xffff8000])
    }
  })
})

// ------------------------------------------------------------------ 65816

const DP = { d0: 0xa5, d1: 0xa9, a0: 0x89 }
const PFGOAL = 0x14c3
const SNES_FOX = 0x7e3136
const PEN_ENTRY = 0x15e2

function runSnes(code: Uint8Array, x: number, y: number, entryCode: number, player: number, ownEndBottom: boolean) {
  const memory = new Map<number, number>()
  const byte = (at: number) => memory.get(at) ?? 0
  const w = (at: number) => byte(at) | (byte(at + 1) << 8)
  const setW = (at: number, value: number) => {
    memory.set(at, value & 0xff)
    memory.set(at + 1, (value >> 8) & 0xff)
  }
  setW(DP.d0, x)
  setW(DP.d1, y)
  setW(DP.a0, PEN_ENTRY)
  memory.set(PEN_ENTRY - 2, entryCode)
  memory.set(PEN_ENTRY - 1, player)
  memory.set(PEN_ENTRY, 0x77) // the next entry, which a word read at a0 - 1 takes as its high byte
  setW(PFGOAL + (player & 0x7f) * 2, ownEndBottom ? 1 : 0)
  let [acc, yReg, n, z, c] = [0, 0x4242, false, false, false]
  const flags = (value: number) => {
    n = (value & 0x8000) !== 0
    z = (value & 0xffff) === 0
  }
  let pc = 0
  for (let steps = 0; steps < 200; steps++) {
    const op = code[pc]
    const imm = code[pc + 1] | (code[pc + 2] << 8)
    const dp = code[pc + 1]
    switch (op) {
      case 0xc6:
      case 0xe6: {
        const value = (w(dp) + (op === 0xe6 ? 1 : -1)) & 0xffff
        setW(dp, value)
        flags(value)
        pc += 2
        break
      }
      case 0xb2:
        acc = w(w(dp))
        flags(acc)
        pc += 2
        break
      case 0xa5:
        acc = w(dp)
        flags(acc)
        pc += 2
        break
      case 0x85:
        setW(dp, acc)
        pc += 2
        break
      case 0x29:
        acc &= imm
        flags(acc)
        pc += 3
        break
      case 0xa9:
        acc = imm
        flags(acc)
        pc += 3
        break
      case 0xc9:
        c = acc >= imm
        flags((acc - imm) & 0xffff)
        pc += 3
        break
      case 0x0a:
        c = (acc & 0x8000) !== 0
        acc = (acc << 1) & 0xffff
        flags(acc)
        pc += 1
        break
      case 0xa8:
        yReg = acc
        flags(yReg)
        pc += 1
        break
      case 0xb9:
        acc = w(imm + yReg)
        flags(acc)
        pc += 3
        break
      case 0x8f: {
        const long = imm | (code[pc + 3] << 16)
        setW(long, acc)
        pc += 4
        break
      }
      case 0x60:
        return { fox: s16(w(SNES_FOX)), foy: s16(w(SNES_FOX + 2)), a0: w(DP.a0) }
      case 0xf0:
      case 0x90:
      case 0xb0:
      case 0x30:
      case 0x80: {
        const taken = { 0xf0: z, 0x90: !c, 0xb0: c, 0x30: n, 0x80: true }[op]!
        pc += 2
        if (taken) pc += s8(code[pc - 1])
        break
      }
      default:
        throw new Error(`65816 opcode ${op.toString(16)} at ${pc} is not in the interpreter`)
    }
  }
  throw new Error('runs away')
}

describe('the faceoff spot fix, SNES', () => {
  it('puts every faceoff on the dot the rules give', () => {
    const code = snesFaceoffCode(PFGOAL, SNES_FOX, SNES_FOX + 2)
    for (const t of cases()) {
      const raw = t.code === 0x0e ? [0, 0] : [t.x, t.y]
      const out = runSnes(code, raw[0], raw[1], t.code, t.player, t.bottom)
      expect([out.fox, out.foy], JSON.stringify(t)).toEqual(meant(t.code, raw[0], raw[1], t.bottom, [0x14, 0x2e]))
      expect(out.a0).toBe(PEN_ENTRY)
    }
  })
})

// --------------------------------------------------------------- in ROMs

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}

describe.skipIf(!existsSync(path('nhl94.bin')))('the faceoff spot fix in the Genesis ROM', () => {
  it('calls the new code from Stop4Pen, and comes out again', () => {
    const rom = new Uint8Array(readFileSync(path('nhl94.bin')))
    const hacked = hackRom(rom, { ...NO_HACKS, faceoffFix: true })
    expect(readU16(hacked, 0x12504)).toBe(0x4eb9)
    const target = readU32(hacked, 0x12506)
    expect(Buffer.from(hacked.subarray(target, target + FACEOFF_CODE.length))).toEqual(Buffer.from(FACEOFF_CODE))
    for (let at = 0x1250a; at < 0x1255a; at += 2) expect(readU16(hacked, at)).toBe(0x4e71)
    // The call to limitfo after it is the game's own.
    expect(readU16(hacked, 0x1255a)).toBe(0x6100)
    expect(detectHacks(hacked)).toEqual({ choices: { ...NO_HACKS, faceoffFix: true }, unknown: [] })
    expect(Buffer.compare(hackRom(hacked, NO_HACKS), rom)).toBe(0)
  })
})

const snesNames = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))

describe.skipIf(snesNames.length === 0)('the faceoff spot fix in SNES ROMs', () => {
  snesNames.forEach((name, n) => {
    it(`is put in and taken out of SNES ROM ${n + 1}`, () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      expect(detectSnesHacks(project.bytes)).toMatchObject({ choices: { faceoffFix: false } })
      expect(detectSnesHacks(project.bytes).unknown).not.toContain('faceoffFix')
      const hacked = applySnesHacks(project, { faceoffFix: true })
      expect(detectSnesHacks(hacked.bytes).choices.faceoffFix).toBe(true)
      // The new code stores where the game's code did, and reads the player's end where its icing rule does.
      const [call, code] = relocatedSnesHack(hacked.bytes, 'faceoffFix')!
      expect(Buffer.from(hacked.bytes.subarray(call.at, call.at + call.hacked.length))).toEqual(Buffer.from(call.hacked))
      expect(Buffer.from(hacked.bytes.subarray(code.at, code.at + code.hacked.length))).toEqual(Buffer.from(code.hacked))
      // The same new code as for a ROM without the hack: the addresses read from the ROM's own code.
      expect(Buffer.from(code.hacked)).toEqual(Buffer.from(relocatedSnesHack(project.bytes, 'faceoffFix')![1].hacked))
      const off = applySnesHacks(hacked, { faceoffFix: false })
      expect(Buffer.compare(Buffer.from(off.bytes), Buffer.from(project.bytes))).toBe(0)
    })
  })

  it('finds Stop4Pen in the original game where the disassembly has it, and reads its addresses', () => {
    if (!existsSync(path('NHL94.smc'))) return
    const project = openRom(new Uint8Array(readFileSync(path('NHL94.smc'))))
    const [call, code] = relocatedSnesHack(project.bytes, 'faceoffFix')!
    expect(call.at).toBe(loRomOffset(0x9e, 0xb326))
    expect(Buffer.from(code.hacked)).toEqual(Buffer.from(snesFaceoffCode(PFGOAL, SNES_FOX, SNES_FOX + 2)))
  })
})
