import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { openRom } from '../src/core/rom'
import { loRomOffset } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks, relocatedSnesHack } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

describe.skipIf(names.length === 0)('the SNES penalty shot fixes', () => {
  names.forEach((name, n) => {
    it(`ends the penalty shot at the knocked-off net and the still-puck whistles, in SNES ROM ${n + 1}`, () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      const state = detectSnesHacks(project.bytes)
      expect(state.unknown).not.toContain('penaltyShotFixes')
      expect(state.choices.penaltyShotFixes).toBe(false)
      const [net, still, code] = relocatedSnesHack(project.bytes, 'penaltyShotFixes')!
      // The game's own: lda #PenGhold; sta d0; jmp AddPenalty2, and jsl AddPenalty2 after lda #PenOOP; sta d0.
      expect(hex(net.original!).slice(0, 12)).toBe('a9080085a54c')
      expect(still.original![0]).toBe(0x22)
      expect(hex(project.bytes.subarray(still.at - 10, still.at - 5))).toBe('a9060085a5')
      const addPenalty = hex(net.original!.subarray(6, 8))
      expect(hex(still.original!.subarray(1, 3))).toBe(addPenalty)

      const hacked = applySnesHacks(project, { penaltyShotFixes: true }).bytes
      expect(detectSnesHacks(hacked).choices.penaltyShotFixes).toBe(true)
      const bank = 0x80 | Math.floor(net.at / 0x8000)
      // checkgoalp: jmp to the new code, then five nops.
      expect(hacked[net.at]).toBe(0x4c)
      expect(hex(hacked.subarray(net.at + 3, net.at + 8))).toBe('eaeaeaeaea')
      const room = loRomOffset(bank, hacked[net.at + 1] | (hacked[net.at + 2] << 8))
      expect(room).toBe(code.at)
      // pucknorm: jsl to the second part.
      expect(hacked[still.at]).toBe(0x22)
      expect(loRomOffset(hacked[still.at + 3], hacked[still.at + 1] | (hacked[still.at + 2] << 8))).toBe(room + 12)
      // Both parts: jsl EndPenaltyShotPlay, a call the game itself makes; then d0 again and on to AddPenalty2.
      const endCall = hex(hacked.subarray(room, room + 4))
      expect(endCall.slice(0, 2)).toBe('22')
      expect(hex(project.bytes).split(endCall).length - 1).toBeGreaterThan(0)
      expect(hex(hacked.subarray(room + 4, room + 12))).toBe(hex(net.original!))
      expect(hex(hacked.subarray(room + 12, room + 16))).toBe(endCall)
      expect(hex(hacked.subarray(room + 16, room + 25))).toBe(`a9060085a55c${addPenalty}${hex(still.original!.subarray(3, 4))}`)

      // Taken out, the ROM is as it was.
      const off = applySnesHacks({ ...project, bytes: hacked }, { penaltyShotFixes: false })
      expect(Buffer.compare(Buffer.from(off.bytes), Buffer.from(project.bytes))).toBe(0)
    })

    it(`goes in and out alongside every other SNES hack, in SNES ROM ${n + 1}`, () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      const { choices, unknown } = detectSnesHacks(project.bytes)
      const all = Object.fromEntries(Object.keys(choices).filter((hack) => hack !== 'showMaxBoost' && hack !== 'fighting' && !unknown.includes(hack as never)).map((hack) => [hack, true]))
      const hacked = applySnesHacks(project, all)
      const after = detectSnesHacks(hacked.bytes)
      expect(after.unknown).toEqual(unknown)
      for (const hack of Object.keys(all)) expect(after.choices[hack as keyof typeof after.choices], hack).toBe(true)
      const none = Object.fromEntries(Object.keys(all).map((hack) => [hack, choices[hack as keyof typeof choices]]))
      const back = applySnesHacks(hacked, none)
      // Hacks the ROM had when opened (an intro already skipped) cannot all come out; the rest must.
      if (Object.values(choices).every((on) => !on)) expect(Buffer.compare(Buffer.from(back.bytes), Buffer.from(project.bytes))).toBe(0)
      expect(detectSnesHacks(back.bytes).choices).toEqual(choices)
    })
  })
})
