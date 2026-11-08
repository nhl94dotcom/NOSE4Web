import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readU16, readU32 } from '../src/core/bytes'
import { detectHacks, hackRom, NO_HACKS, PASS_CODE } from '../src/core/hacks'

// The rocket pass fix's new code is checked by running it: a small 68000
// interpreter, which decodes each instruction from its bit fields as the
// 68000 manual gives them, runs it against what the fix is meant to work out.
// A wrong register, size or branch in the hand-assembled code shows up here.

const PUCKVZ = 0xb776
const s16 = (v: number) => ((v & 0xffff) ^ 0x8000) - 0x8000
const s32 = (v: number) => v | 0
const s8 = (v: number) => ((v & 0xff) ^ 0x80) - 0x80

interface Machine {
  d: number[]
  memory: Map<number, number>
  steps: number
}

function run(code: Uint8Array, d: number[]): Machine {
  const m: Machine = { d: d.map((v) => v >>> 0), memory: new Map(), steps: 0 }
  let n = false
  let z = false
  let c = false
  let pc = 0
  const word = (at: number) => readU16(code, at)
  const setWord = (r: number, v: number) => (m.d[r] = ((m.d[r] & 0xffff0000) | (v & 0xffff)) >>> 0)
  const flags = (v: number, bits: 16 | 32 | 8) => {
    const value = bits === 32 ? s32(v) : bits === 16 ? s16(v) : s8(v)
    n = value < 0
    z = value === 0
    c = false
  }
  const condition = (cc: number): boolean => {
    switch (cc) {
      case 0x0: return true
      case 0x1: return false
      case 0x3: return c || z
      case 0x4: return !c
      case 0x6: return !z
      case 0x7: return z
      case 0xa: return !n
      case 0xb: return n
      default: throw new Error(`condition ${cc} is not in the interpreter`)
    }
  }
  for (;;) {
    if (++m.steps > 1000) throw new Error('runs away')
    const at = pc
    const op = word(at)
    pc += 2
    const reg = op & 7
    const high = (op >> 9) & 7
    if (op === 0x4e75) return m
    if ((op & 0xf100) === 0x7000) {
      m.d[high] = s8(op) >>> 0
      flags(m.d[high], 32)
    } else if ((op & 0xf000) === 0x6000 && (op & 0xff) !== 0) {
      if (condition((op >> 8) & 0xf)) pc = at + 2 + s8(op)
    } else if ((op & 0xf0f8) === 0x50c8) {
      const displacement = s16(word(pc))
      pc += 2
      if (!condition((op >> 8) & 0xf)) {
        const count = s16(m.d[reg] - 1)
        setWord(reg, count)
        if (count !== -1) pc = at + 2 + displacement
      }
    } else if ((op & 0xc000) === 0 && ((op >> 12) & 3) !== 0) {
      const size = [0, 8, 32, 16][(op >> 12) & 3] as 8 | 16 | 32
      const srcMode = (op >> 3) & 7
      const destMode = (op >> 6) & 7
      let value: number
      if (srcMode === 0) value = m.d[reg]
      else if (srcMode === 7 && reg === 4) {
        value = size === 32 ? readU32(code, pc) : word(pc)
        pc += size === 32 ? 4 : 2
      } else throw new Error(`move source ${srcMode}`)
      if (destMode === 0) {
        if (size === 32) m.d[high] = value >>> 0
        else if (size === 16) setWord(high, value)
        else m.d[high] = ((m.d[high] & 0xffffff00) | (value & 0xff)) >>> 0
      } else if (destMode === 7 && high === 0) {
        m.memory.set(word(pc), value & (size === 8 ? 0xff : 0xffff))
        pc += 2
      } else throw new Error(`move destination ${destMode}`)
      flags(value, size)
    } else if ((op & 0xfff8) === 0x4440) {
      const result = -s16(m.d[reg])
      setWord(reg, result)
      flags(result, 16)
      c = (result & 0xffff) !== 0
    } else if ((op & 0xfff8) === 0x48c0) {
      m.d[reg] = s16(m.d[reg]) >>> 0
      flags(m.d[reg], 32)
    } else if ((op & 0xfff8) === 0x4840) {
      m.d[reg] = ((m.d[reg] >>> 16) | (m.d[reg] << 16)) >>> 0
      flags(m.d[reg], 32)
    } else if ((op & 0xfff8) === 0x4a40) {
      flags(m.d[reg], 16)
    } else if ((op & 0xf1f8) === 0x9040 || (op & 0xf1f8) === 0xd040) {
      const subtract = (op & 0xf000) === 0x9000
      const a = s16(m.d[high])
      const b = s16(m.d[reg])
      const result = subtract ? a - b : a + b
      setWord(high, result)
      flags(result, 16)
      c = subtract ? (a & 0xffff) < (b & 0xffff) : (a & 0xffff) + (b & 0xffff) > 0xffff
    } else if ((op & 0xf1f8) === 0x81c0) {
      const dividend = s32(m.d[high])
      const divisor = s16(m.d[reg])
      if (divisor === 0) throw new Error('division by zero')
      const quotient = Math.trunc(dividend / divisor)
      if (quotient > 32767 || quotient < -32768) {
        c = false
      } else {
        const remainder = dividend - quotient * divisor
        m.d[high] = (((remainder & 0xffff) << 16) | (quotient & 0xffff)) >>> 0
        flags(quotient, 16)
      }
    } else if ((op & 0xf1f8) === 0xb140) {
      const result = (m.d[reg] ^ m.d[high]) & 0xffff
      setWord(reg, result)
      flags(result, 16)
    } else if ((op & 0xf1ff) === 0xb07c) {
      const immediate = word(pc)
      pc += 2
      const a = m.d[high] & 0xffff
      const result = s16(a - immediate)
      flags(result, 16)
      c = a < immediate
    } else if ((op & 0xf020) === 0xe000) {
      const left = (op & 0x100) !== 0
      const size = [8, 16, 32][(op >> 6) & 3] as 8 | 16 | 32
      const logical = ((op >> 3) & 3) === 1
      const count = high === 0 ? 8 : high
      const mask = size === 32 ? 0xffffffff : (1 << size) - 1
      const value = m.d[reg] & mask
      let result: number
      if (left) result = size === 32 ? (value << count) >>> 0 : (value << count) & mask
      else if (logical) result = value >>> count
      else result = (size === 32 ? s32(value) : size === 16 ? s16(value) : s8(value)) >> count
      if (size === 32) m.d[reg] = result >>> 0
      else setWord(reg, result)
      flags(result, size)
    } else {
      throw new Error(`opcode ${op.toString(16)} at ${at} is not in the interpreter`)
    }
  }
}

// What the fix is meant to give, from the two roots the game has worked out:
// the first time not below 0, in 64ths of a second, at least an eighth and at
// most 3 seconds; none at all gives 3 seconds, as the game has it. The lift
// is that time in whole eighths, at most 12.
function meant(root: number, j: number, quarterK: number): { time: number; lift: number } {
  let time = 192
  for (const sign of [1, -1]) {
    const numerator = s16(sign * root - j)
    const t = numerator / quarterK
    if (t >= 0) {
      time = Math.min(192, Math.max(8, Math.floor((8 * numerator) / quarterK)))
      break
    }
  }
  return { time, lift: Math.min(12, time >> 3) }
}

function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

describe('the rocket pass fix', () => {
  it('works out the meeting time in 64ths of a second, from the right root', () => {
    const random = seeded(94)
    const pick = (least: number, most: number) => least + Math.floor(random() * (most - least + 1))
    const cases: [number, number, number][] = [
      // From recorded passes: a rocket pass (1.9 eighths, made in 1), and the wrong root taken.
      [869, 600, -302],
      [911, 558, -401],
      [100, 100, -50],
      [100, 99, -50],
      [100, 101, 50],
      [0, 0, -1],
    ]
    for (let i = 0; i < 4000; i++) {
      const quarterK = pick(1, 1200) * (random() < 0.85 ? -1 : 1)
      cases.push([pick(0, 4000), pick(-4000, 4000), quarterK])
    }
    for (const [root, j, quarterK] of cases) {
      const machine = run(PASS_CODE, [root, 0, 0, 1, j, quarterK, 0, 0])
      const { time, lift } = meant(root, j, quarterK)
      expect(s16(machine.d[2]), `${root} ${j} ${quarterK}`).toBe(time)
      expect(machine.memory.get(PUCKVZ), `${root} ${j} ${quarterK}`).toBe(lift)
    }
    // A rocket pass: due in 1.9 eighths, which the original game makes in 1; the fix in 15 64ths.
    expect(s16(run(PASS_CODE, [100, 0, 0, 1, 670, -300, 0, 0]).d[2])).toBe(15)
    // The wrong root: just below 0, which the original game takes as 1 eighth; the fix takes the
    // other, 38 64ths (4.75 eighths), as a recorded pass in DAL-BOS needed.
    expect(s16(run(PASS_CODE, [869, 0, 0, 1, 600, -302, 0, 0]).d[2])).toBe(38)
  })
})

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))

describe.skipIf(!existsSync(romPath))('the rocket pass fix in the ROM', () => {
  it('calls the new code from passtoa0, changes what uses the time, and comes out again', () => {
    const rom = new Uint8Array(readFileSync(romPath))
    const hacked = hackRom(rom, { ...NO_HACKS, passFix: true })
    expect(readU16(hacked, 0xbf40)).toBe(0x4eb9)
    const target = readU32(hacked, 0xbf42)
    expect(Buffer.from(hacked.subarray(target, target + PASS_CODE.length))).toEqual(Buffer.from(PASS_CODE))
    for (let at = 0xbf46; at < 0xbf70; at += 2) expect(readU16(hacked, at)).toBe(0x4e71)
    const hex = (at: number, length: number) => Buffer.from(hacked.subarray(at, at + length)).toString('hex')
    expect(hex(0xbf70, 8)).toBe('30024e710440000a')
    expect(hex(0xbf88, 2)).toBe('e880')
    expect(hex(0xbf98, 2)).toBe('e881')
    expect(hex(0xbfa6, 4)).toBe('c4fc000f')
    expect(detectHacks(hacked)).toEqual({ choices: { ...NO_HACKS, passFix: true }, unknown: [] })
    expect(Buffer.compare(hackRom(hacked, NO_HACKS), rom)).toBe(0)
  })
})
