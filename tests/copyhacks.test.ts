import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { detectHacks, hackRom, hacksCopiedFrom, NO_HACKS, type HackState } from '../src/core/hacks'
import { openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks, SNES_HACKS, snesHacksCopiedFrom, type SnesHackState } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))

describe('copying hacks from another ROM', () => {
  it('takes the other ROM\'s choices where both are known, and names the rest', () => {
    const current: HackState = { choices: { ...NO_HACKS }, unknown: ['goalieLine'] }
    const other: HackState = {
      choices: { ...NO_HACKS, passFix: true, faceoffFix: true, goalieLine: 144, weightFix: 'simple', speedBurst: 24 },
      unknown: ['speedBurst'],
    }
    const { choices, notCopied } = hacksCopiedFrom(current, other)
    expect(choices).toEqual({ ...NO_HACKS, passFix: true, faceoffFix: true })
    expect(notCopied).toHaveLength(3)
    expect(notCopied.join(' ')).toMatch(/Weight bug fix: the other ROM has the earlier, simpler fix/)
    // An earlier version this ROM has too is kept.
    expect(hacksCopiedFrom({ choices: { ...NO_HACKS, weightFix: 'simple' }, unknown: [] }, { choices: { ...NO_HACKS, weightFix: 'simple' }, unknown: [] }).choices.weightFix).toBe('simple')

    const snesCurrent = { choices: { faceoffFix: false, hotColdFix: false, extraAttackerFix: false }, unknown: ['extraAttackerFix'] } as unknown as SnesHackState
    const snesOther = { choices: { faceoffFix: true, hotColdFix: false, extraAttackerFix: true }, unknown: [] } as unknown as SnesHackState
    const snes = snesHacksCopiedFrom(
      { ...snesCurrent, choices: { ...detectSnesHacksBlank(), ...snesCurrent.choices } },
      { ...snesOther, choices: { ...detectSnesHacksBlank(), ...snesOther.choices } },
    )
    expect(snes.choices).toMatchObject({ faceoffFix: true, extraAttackerFix: false })
    expect(snes.notCopied).toEqual(['Extra attacker fix: one of the two ROMs has other code in its place.'])
  })

  it.skipIf(!existsSync(path('nhl94.bin')))('sets a Genesis ROM to another\'s hacks, which then apply the same', () => {
    const rom = new Uint8Array(readFileSync(path('nhl94.bin')))
    const league = hackRom(rom, { ...NO_HACKS, passFix: true, runawayFix: true, goalieHold: 300, wideRatings: true })
    const { choices, notCopied } = hacksCopiedFrom(detectHacks(rom), detectHacks(league))
    expect(notCopied).toEqual([])
    expect(choices).toEqual(detectHacks(league).choices)
  })

  it.skipIf(!existsSync(path('NHL94.smc')))('sets an SNES ROM to another\'s hacks', () => {
    const project = openRom(new Uint8Array(readFileSync(path('NHL94.smc'))))
    const league = applySnesHacks(project, { hotColdFix: true, faceoffFix: true, yButtonFix: true })
    const { choices, notCopied } = snesHacksCopiedFrom(detectSnesHacks(project.bytes), detectSnesHacks(league.bytes))
    expect(notCopied).toEqual([])
    expect(choices).toEqual(detectSnesHacks(league.bytes).choices)
  })
})

// Every SNES hack off.
function detectSnesHacksBlank() {
  return Object.fromEntries(SNES_HACKS.map((hack) => [hack, false]))
}
