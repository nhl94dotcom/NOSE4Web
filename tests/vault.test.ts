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

      // The extra attacker: only in ROMs laid out as the original.
      if (!snesCodeInPlace(project.bytes)) {
        expect(state.unknown).toContain('extraAttackerFix')
        return
      }
      expect(state.unknown).not.toContain('extraAttackerFix')
      const both = applySnesHacks(project, { yButtonFix: true, extraAttackerFix: true }).bytes
      const hook = loRomOffset(0x9b, 0x8c96)
      const code = loRomOffset(0x9b, 0xce78)
      expect(hex(project.bytes.subarray(hook, hook + 3))).toBe('c90100')
      expect(hex(both.subarray(hook, hook + 3))).toBe('2078ce')
      // The Vault's routine: its branches land where its listing says, and it ends by making the hooked test.
      expect(both[code]).toBe(0x48)
      expect(hex(both.subarray(code + 0x16, code + 0x18))).toBe('f007')
      expect(hex(both.subarray(code + 0x1b, code + 0x1f))).toBe('d0f0801e')
      expect(hex(both.subarray(code + 0x3d, code + 0x42))).toBe('68c9010060')
      expect(both[code + 0x42]).toBe(0xff)
      expect(detectSnesHacks(both).choices).toMatchObject({ extraAttackerFix: true, yButtonFix: true })
      const off = applySnesHacks({ ...project, bytes: both }, { yButtonFix: false, extraAttackerFix: false })
      expect(Buffer.compare(Buffer.from(off.bytes), Buffer.from(project.bytes))).toBe(0)
    })
  })
})
