import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { openRom } from '../src/core/rom'
import { loRomOffset, snesCodeInPlace } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks, relocatedSnesHack } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

describe.skipIf(names.length === 0)('the extra attacker and Y button fixes', () => {
  names.forEach((name, n) => {
    it(`go in and come out of SNES ROM ${n + 1}`, () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      const state = detectSnesHacks(project.bytes)

      // The Y button: found in every build by the code around it.
      expect(state.unknown).not.toContain('yButtonFix')
      const [y] = relocatedSnesHack(project.bytes, 'yButtonFix')!
      // lda pfalock,x; beq .t1; lda SPA,x; cmp #SPAburst; bne .t1; rtl
      expect(hex(project.bytes.subarray(y.at - 8, y.at - 6))).toBe('f009')
      expect(hex(project.bytes.subarray(y.at, y.at + 3))).toBe('d0016b')
      const withY = applySnesHacks(project, { yButtonFix: true }).bytes
      expect(hex(withY.subarray(y.at, y.at + 3))).toBe('eaea6b')
      expect(detectSnesHacks(withY).choices.yButtonFix).toBe(true)

      // The extra attacker: in every build, found by the code around it.
      expect(state.unknown).not.toContain('extraAttackerFix')
      const both = applySnesHacks(project, { yButtonFix: true, extraAttackerFix: true }).bytes
      // At $9B:8C96, the code at $9B:CE78, where the code is in place; found by the code around it elsewhere.
      const inPlace = snesCodeInPlace(project.bytes)
      const hook = inPlace ? loRomOffset(0x9b, 0x8c96) : relocatedSnesHack(project.bytes, 'extraAttackerFix')![0].at
      const code = inPlace ? loRomOffset(0x9b, 0xce78) : loRomOffset(0x9b, both[hook + 1] | (both[hook + 2] << 8))
      expect(hex(project.bytes.subarray(hook, hook + 3))).toBe('c90100')
      expect(both[hook]).toBe(0x20)
      if (inPlace) expect(hex(both.subarray(hook, hook + 3))).toBe('2078ce')
      // The Vault's routine: its branches land where its listing says, and it ends by making the hooked test.
      expect(both[code]).toBe(0x48)
      expect(hex(both.subarray(code + 0x16, code + 0x18))).toBe('f007')
      expect(hex(both.subarray(code + 0x1b, code + 0x1f))).toBe('d0f0801e')
      expect(hex(both.subarray(code + 0x3d, code + 0x42))).toBe('68c9010060')
      if (inPlace) expect(both[code + 0x42]).toBe(0xff)
      expect(detectSnesHacks(both).choices).toMatchObject({ extraAttackerFix: true, yButtonFix: true })
      const off = applySnesHacks({ ...project, bytes: both }, { yButtonFix: false, extraAttackerFix: false })
      expect(Buffer.compare(Buffer.from(off.bytes), Buffer.from(project.bytes))).toBe(0)
    })
  })
})

describe('on the SA-1 builds, the scratch variables by the direct page', () => {
  const sa1 = (local.snesRoms ?? []).find((name: string) => /SA1/.test(name) && existsSync(path(name)))
  it.skipIf(!sa1)('names the scratch variables in direct-page form, the game variables $6000 on', () => {
    const project = openRom(new Uint8Array(readFileSync(path(sa1!))))
    const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')
    const code = (hack: 'showMaxBoost' | 'extraAttackerFix' | 'manualPullGoalie') => relocatedSnesHack(project.bytes, hack)!.map((p) => hex(p.hacked)).join(' ')
    // sta d0, adc $AF, ldy a2, each with a nop: these run with D = $3000 there (Match Viewer), so neither $60xx nor
    // $00xx found them.
    expect(code('showMaxBoost')).toContain('a9640085a5ea6b')
    expect(code('extraAttackerFix')).toContain('1865afea8595')
    expect(code('manualPullGoalie')).toContain('a20000a491eab9')
    expect(code('showMaxBoost') + code('extraAttackerFix') + code('manualPullGoalie')).not.toMatch(/8da500|6daf00|ac9100/)
    // The team's pad worked out (tya / lsr / inc), not read from the code's table with the caller's data bank.
    expect(code('manualPullGoalie')).toContain('d00160984a1add')
    expect(code('manualPullGoalie')).toContain('add875')
  })
})
