import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { snesHackSheet } from '../src/core/hacksheet'
import { buildRom, openRom } from '../src/core/rom'
import { loRomOffset } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks, relocatedSnesHack } from '../src/core/sneshacks'

// The three stars' new scoring code, run by a small 65816 interpreter of the instructions it uses, and checked
// against the Genesis option's formula.

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')

// The variables, as the disassembly has them for the original game (the SA-1 builds' moved by $6000).
const DP = { a1: 0x8d, a2: 0x91, d0: 0xa5, r2: 0x08 }
const RAM = { tmscore: 0x178e, goalieEnd: 0x1e23, otScorer: 0x1e1f, tmgoals: 0x18ee, tmassists: 0x1922, tmpshots: 0x1956, checks: 0x168e }

interface Game {
  score: [number, number]
  goalies: [number, number]
  ot: number
  goals: number[]
  assists: number[]
  shots: number[]
  checks: number[]
}
const WEIGHTS = [
  { goal: 11000, assist: 7000, shotFor: 500, check: 500, goalsAgainst: 11000, shotsAgainst: 900, shutout: 16000 },
  { goal: 14300, assist: 9100, shotFor: 650, check: 650, goalsAgainst: 11000, shotsAgainst: 1170, shutout: 20800 },
]

// The score the Genesis option's formula gives player x (0-51).
function meant(g: Game, x: number, choice: number): number {
  const w = WEIGHTS[choice - 1]
  const team = x < 26 ? 0 : 1
  const margin = g.score[team] - g.score[1 - team]
  if (x - team * 26 < g.goalies[team]) {
    const shots = g.shots[x]
    if (shots === 0) return margin
    let score = margin + (shots - (margin < 0 ? 1 : 0)) * w.shotsAgainst + Math.floor((g.assists[x] * w.assist) / 2)
    if (g.goals[x] > 0) score -= g.goals[x] * w.goalsAgainst
    else if (g.score[1 - team] === 0) score += w.shutout
    return score
  }
  return margin + (x === g.ot ? 0xb71b0 : 0) + g.goals[x] * w.goal + g.assists[x] * w.assist + g.shots[x] * w.shotFor + g.checks[x] * w.check
}

// Runs the code for player x; its d0 and d0+2 unpacked to the score they compare as.
function run(code: Uint8Array, mul16u: number, g: Game, x: number, s: number, checksLong: number | null): number {
  const memory = new Map<number, number>()
  const byte = (at: number) => memory.get(at) ?? 0
  const w = (at: number) => byte(at) | (byte(at + 1) << 8)
  const setB = (at: number, value: number) => memory.set(at, value & 0xff)
  const setW = (at: number, value: number) => {
    setB(at, value)
    setB(at + 1, value >> 8)
  }
  for (const team of [0, 1]) {
    setW(RAM.tmscore + s + team * 2, g.score[team])
  }
  setW(RAM.goalieEnd + s, x < 26 ? g.goalies[0] : g.goalies[1] + 26)
  setW(RAM.otScorer + s, g.ot)
  for (let i = 0; i < 52; i++) {
    setB(RAM.tmgoals + s + i, g.goals[i])
    setB(RAM.tmassists + s + i, g.assists[i])
    setB(RAM.tmpshots + s + i, g.shots[i])
    setB((checksLong ?? RAM.checks + s) + i, g.checks[i])
  }
  // Leftovers the code must not depend on.
  setW(DP.d0, 0x1234)
  setW(DP.d0 + 2, 0x5678)
  setW(DP.r2, 0x9abc)
  setW(DP.r2 + 2, 0xdef0)
  let [acc, xReg, yReg, n, z, c, m8] = [0x7777, x, 0x4242, false, false, false, false]
  const stack: number[] = []
  const mask = () => (m8 ? 0xff : 0xffff)
  const flags = (value: number, bits = m8 ? 8 : 16) => {
    const top = 1 << (bits - 1)
    n = (value & top) !== 0
    z = (value & ((top << 1) - 1)) === 0
  }
  const setA = (value: number) => {
    acc = m8 ? (acc & 0xff00) | (value & 0xff) : value & 0xffff
    flags(value)
  }
  const read = (at: number) => (m8 ? byte(at) : w(at))
  const adc = (operand: number) => {
    const a = acc & mask()
    const sum = a + (operand & mask()) + (c ? 1 : 0)
    c = sum > mask()
    setA(sum)
  }
  const sbc = (operand: number) => adc(~operand & mask())
  const compare = (reg: number, operand: number) => {
    c = reg >= operand
    flags((reg - operand) & 0xffff, 16)
  }
  let pc = 0
  for (let steps = 0; steps < 2000; steps++) {
    const op = code[pc]
    const b1 = code[pc + 1]
    const imm16 = b1 | (code[pc + 2] << 8)
    const immM = m8 ? b1 : imm16
    const immLen = m8 ? 2 : 3
    switch (op) {
      case 0x64: setW(b1, 0); pc += 2; break
      case 0xa9: setA(immM); pc += immLen; break
      case 0x85: if (m8) setB(b1, acc); else setW(b1, acc); pc += 2; break
      case 0xa5: setA(read(b1)); pc += 2; break
      case 0xe0: compare(xReg, imm16); pc += 3; break
      case 0xec: compare(xReg, w(imm16)); pc += 3; break
      case 0xa4: yReg = w(b1); flags(yReg, 16); pc += 2; break
      case 0xa2: xReg = imm16; flags(xReg, 16); pc += 3; break
      case 0xb9: setA(read(imm16 + yReg)); pc += 3; break
      case 0xbd: setA(read(imm16 + xReg)); pc += 3; break
      case 0xbf: setA(read((imm16 | (code[pc + 3] << 16)) + xReg)); pc += 4; break
      case 0x38: c = true; pc += 1; break
      case 0x18: c = false; pc += 1; break
      case 0x65: adc(read(b1)); pc += 2; break
      case 0x69: adc(immM); pc += immLen; break
      case 0xe5: sbc(read(b1)); pc += 2; break
      case 0xe9: sbc(immM); pc += immLen; break
      case 0xf9: sbc(read(imm16 + yReg)); pc += 3; break
      case 0x29: setA(acc & immM); pc += immLen; break
      case 0x3a: setA((acc - 1) & mask()); pc += 1; break
      case 0x0a: c = (acc & ((mask() + 1) >> 1)) !== 0; setA((acc << 1) & mask()); pc += 1; break
      case 0x46: { const value = w(b1); c = (value & 1) !== 0; setW(b1, value >> 1); flags(value >> 1, 16); pc += 2; break }
      case 0x66: { const value = w(b1); const out = (value >> 1) | (c ? 0x8000 : 0); c = (value & 1) !== 0; setW(b1, out); flags(out, 16); pc += 2; break }
      case 0xe2: if (b1 !== 0x20) throw new Error('sep'); m8 = true; pc += 2; break
      case 0xc2: if (b1 !== 0x20) throw new Error('rep'); m8 = false; pc += 2; break
      case 0xda: stack.push(xReg); pc += 1; break
      case 0xfa: xReg = stack.pop()!; flags(xReg, 16); pc += 1; break
      case 0x22: {
        const to = imm16 | (code[pc + 3] << 16)
        if (to !== mul16u) throw new Error(`jsl ${to.toString(16)}`)
        if (m8) throw new Error('Mul16U in 8 bits')
        const product = (acc & 0xffff) * xReg
        setW(DP.r2, product & 0xffff)
        setW(DP.r2 + 2, Math.floor(product / 0x10000))
        setW(0, 0xeeee)
        setW(4, 0xeeee)
        xReg = 0xdddd
        pc += 4
        break
      }
      case 0x6b: {
        if (stack.length) throw new Error('stack left')
        const hi = w(DP.d0 + 2)
        const lo = w(DP.d0)
        expect(lo & 0x8000).toBe(0)
        return (((hi ^ 0x8000) - 0x8000) * 0x8000) + lo
      }
      case 0x30: case 0x10: case 0xf0: case 0xd0: case 0x80: {
        const taken = { 0x30: n, 0x10: !n, 0xf0: z, 0xd0: !z, 0x80: true }[op]!
        pc += 2
        if (taken) pc += ((b1 ^ 0x80) - 0x80)
        break
      }
      case 0x82: pc += 3 + ((imm16 ^ 0x8000) - 0x8000); break
      default:
        throw new Error(`65816 opcode ${op.toString(16)} at ${pc} is not in the interpreter`)
    }
  }
  throw new Error('runs away')
}

function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x80000000
  }
}
function randomGame(random: () => number): Game {
  const int = (most: number) => Math.floor(random() * (most + 1))
  const list = () => Array.from({ length: 52 }, () => (random() < 0.4 ? 0 : int(5)))
  const goals = list()
  const shots = goals.map((goal) => goal + int(8))
  const score: [number, number] = [int(7), int(7)]
  if (random() < 0.15) score[1] = 0
  const goalies: [number, number] = [1 + int(1), 1 + int(1)]
  // A goalie's goals against; one who faced no shots, now and then.
  for (const at of [0, 1, 26, 27]) {
    if (random() < 0.2) shots[at] = 0
    goals[at] = Math.min(goals[at], shots[at])
    if (random() < 0.3) goals[at] = 0
  }
  return { score, goalies, ot: random() < 0.5 ? int(51) : 0xffff, goals, assists: list(), shots, checks: list() }
}

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES three stars', () => {
  it("ShowThreeStars's .17 is found where the disassembly has it, and jsl's to the new code", () => {
    const rom = open('NHL94.smc')
    const site = loRomOffset(0x9c, 0x9ec5)
    const places = relocatedSnesHack(rom.bytes, 'threeStars')!
    expect(places[0].at).toBe(site)
    expect(hex(rom.bytes, site, 7)).toBe('6491a90200858d')
    for (const choice of [1, 2]) {
      const on = applySnesHacks(rom, {}, false, { threeStars: choice }).bytes
      expect(on[site]).toBe(0x22)
      expect(on[site + 4]).toBe(0x6b)
      expect(detectSnesHacks(on).amounts?.threeStars).toBe(choice)
    }
  })

  it("NOSE4Web's earlier versions (4000 / 4500, then 1500 / 1700 a shot faced) are recognised and brought up to date", () => {
    const rom = open('NHL94.smc')
    for (const [choice, now, then] of [[1, '8403', 'a00f'], [2, '9204', '9411'], [1, '8403', 'dc05'], [2, '9204', 'a406']] as const) {
      const on = applySnesHacks(rom, {}, false, { threeStars: choice })
      const room = relocatedSnesHack(on.bytes, 'threeStars')![1].at
      const first = on.bytes.slice()
      const code = Buffer.from(first.subarray(room, room + 400)).toString('hex')
      const at = code.indexOf(`daa2${now}22`)
      expect(at % 2).toBe(0)
      expect(code.indexOf(`daa2${now}22`, at + 2)).toBe(-1)
      first.set(Buffer.from(then, 'hex'), room + at / 2 + 2)
      const read = detectSnesHacks(first)
      expect(read.unknown).not.toContain('threeStars')
      expect(read.amounts?.threeStars).toBe(choice)
      expect(read.vaultVersions).toContain('threeStars')
      expect(Buffer.compare(applySnesHacks({ ...on, bytes: first }, { threeStars: true }, true).bytes, on.bytes)).toBe(0)
      expect(Buffer.compare(buildRom(applySnesHacks({ ...on, bytes: first }, {}, false, { threeStars: 0 })), buildRom(rom))).toBe(0)
    }
  })

  for (const name of names) {
    it(`${name}: the new code scores as the Genesis option, for both choices`, () => {
      const rom = open(name)
      const before = Buffer.from(rom.bytes).toString('hex')
      const own = /daa90000a2..009f(......)9f/.exec(before)
      const checksLong = own && own.index % 2 === 0 ? parseInt(own[1].match(/../g)!.reverse().join(''), 16) : null
      const mulAt = before.search(/a2f82a22/)
      const mul16u = parseInt(before.slice(mulAt + 8, mulAt + 14).match(/../g)!.reverse().join(''), 16)
      const shiftFor = before.includes('ec237e3056ec1f7e') ? 0x6000 : 0
      for (const choice of [1, 2]) {
        const on = applySnesHacks(rom, {}, false, { threeStars: choice }).bytes
        const code = relocatedSnesHack(on, 'threeStars')![1].hacked
        const random = seeded(choice * 7 + name.length)
        for (let game = 0; game < 60; game++) {
          const g = randomGame(random)
          for (let x = 0; x < 52; x++) expect(run(code, mul16u, g, x, shiftFor, checksLong), `${name} game ${game} player ${x}`).toBe(meant(g, x, choice))
        }
      }
    })

    it(`${name}: goes in, changes choice and comes out byte for byte`, () => {
      const rom = open(name)
      expect(detectSnesHacks(rom.bytes).unknown).not.toContain('threeStars')
      expect(detectSnesHacks(rom.bytes).amounts?.threeStars).toBe(0)
      const on = openRom(buildRom(applySnesHacks(rom, {}, false, { threeStars: 1 })))
      expect(detectSnesHacks(on.bytes).amounts?.threeStars).toBe(1)
      expect(snesHackSheet(on.bytes, name).sections.flatMap((section) => section.items).find((item) => item.title === 'Three stars')?.text).toContain('line changes off')
      const two = openRom(buildRom(applySnesHacks(on, {}, false, { threeStars: 2 })))
      expect(detectSnesHacks(two.bytes).amounts?.threeStars).toBe(2)
      expect(detectSnesHacks(two.bytes).unknown).not.toContain('threeStars')
      const back = applySnesHacks(two, {}, false, { threeStars: 0 })
      expect(Buffer.compare(buildRom(back), buildRom(rom))).toBe(0)
    })
  }
})
