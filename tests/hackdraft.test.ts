import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { applyHacks, detectHacks, NO_HACKS } from '../src/core/hacks'
import { openRom } from '../src/core/rom'
import { detectSnesHacks, SNES_AMOUNT_OFF } from '../src/core/sneshacks'
import { applyHackDraft, draftLeft, layOnNhl94, layOnSnes, nhl95Rules } from '../src/hackdraft'

const romPath = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const has = (name: string) => existsSync(romPath(name))
const openNamed = (name: string) => openRom(new Uint8Array(readFileSync(romPath(name))))

// The cases the review of 2026-11-21 found: kept choices laid on a changed ROM keep each page's rules, and choices
// Apply cannot put in are not left waiting.
describe('kept hack choices, through the pages’ rules', () => {
  it("NHL '95: one tie choice turns the others off, and no fighting means no momentum", () => {
    expect(nhl95Rules({ seasonShootout: true })).toEqual({ seasonOvertime: false, seasonShootoutNow: false })
    expect(nhl95Rules({ fighting: false })).toMatchObject({ fightMomentum: false, fightingOff: false, fightingArcade: false })
  })

  it.skipIf(!has('nhl94.bin'))('NHL 94: Barr pick laid on a ROM with the coin turns the coin off, and applies', () => {
    const rom = openNamed('nhl94.bin')
    const base = detectHacks(rom.bytes).choices
    // Chosen on the original ROM; then (Redo) the ROM has the coin.
    const draft = { base, wanted: { ...base, barrPick: true }, count: 1 }
    const coin = applyHacks(rom, { ...NO_HACKS, barrCoin: true })
    const laid = layOnNhl94(detectHacks(coin.bytes).choices, draft)
    expect([laid.barrPick, laid.barrCoin]).toEqual([true, false])
    expect(detectHacks(applyHackDraft(coin, draft).bytes).choices.barrPick).toBe(true)
  })

  it.skipIf(!has('nhl94.bin'))('NHL 94: an injury cap with no injury risk, or momentum without fighting, is not left waiting', () => {
    const rom = openNamed('nhl94.bin')
    const base = detectHacks(rom.bytes).choices
    expect(base.injuryBonus).toBe(0)
    expect(draftLeft(rom, { base, wanted: { ...base, injuryCap: 60 }, count: 1 })).toBe(false)
    expect(draftLeft(rom, { base, wanted: { ...base, fightMomentum: true }, count: 1 })).toBe(false)
    // A real change is.
    expect(draftLeft(rom, { base, wanted: { ...base, headBleeding: true }, count: 1 })).toBe(true)
    // Once it is in, it is not.
    const applied = applyHackDraft(rom, { base, wanted: { ...base, headBleeding: true }, count: 1 })
    expect(draftLeft(applied, { base, wanted: { ...base, headBleeding: true }, count: 1 })).toBe(false)
  })

  it.skipIf(!has('NHL94.smc'))('SNES: overtime until a goal laid on a ROM with the shootout turns its amount off, and applies', () => {
    const rom = openNamed('NHL94.smc')
    const state = detectSnesHacks(rom.bytes)
    const amounts = state.amounts ?? SNES_AMOUNT_OFF
    const shootout = applyHackDraft(rom, {
      base: state.choices,
      wanted: { ...state.choices, seasonShootout: true },
      baseAmounts: amounts,
      amounts: { ...amounts, seasonShootout: 1 },
      count: 1,
    })
    const now = detectSnesHacks(shootout.bytes)
    expect(now.choices.seasonShootout).toBe(true)
    // Chosen there: overtime until a goal, the shootout's amount left as it was.
    const draft = { base: now.choices, wanted: { ...now.choices, seasonOvertime: true }, baseAmounts: now.amounts, amounts: now.amounts, count: 1 }
    const laid = layOnSnes(now.choices, now.amounts ?? SNES_AMOUNT_OFF, draft)
    expect([laid.choices.seasonOvertime, laid.choices.seasonShootout, laid.amounts.seasonShootout]).toEqual([true, false, SNES_AMOUNT_OFF.seasonShootout])
    const after = detectSnesHacks(applyHackDraft(shootout, draft).bytes).choices
    expect([after.seasonOvertime, after.seasonShootout]).toEqual([true, false])
  })
})
