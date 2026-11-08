import { describe, expect, it } from 'vitest'
import { HACK_TITLES, NO_HACKS, type HackChoices } from '../src/core/hacks'
import { genesisHackSheet, hackSheetDiscord, hackSheetHtml } from '../src/core/hacksheet'

describe('the hack sheet', () => {
  it('explains every hack that differs from the original, and only those', () => {
    const all: HackChoices = {
      ...NO_HACKS,
      weightFix: 'on', bodychecks: 'on', secondAssist: true, plusMinus: true, wideRatings: true, bonuses: 'disabled',
      threeStars: 'linesOn', baseWeight: 144, checkFix: 'all120', aggressionFix: true, ppPkFix: true, comebackFix: true,
      passFix: true, faceoffFix: true, runawayFix: true, penaltyShotTableFix: true, penaltyShotFixes: true,
      goaliePullFix: true, blindRingFix: true, snipingFix: true, awarenessFix: true, crowdFix: true, stickShots: true,
      goalieHold: 0, goalieWidth: 40, goalieOut: 224, goalieLine: 144, stamina: true, energyDrain: 65,
      energyRecovery: 6, speedBurst: 24, turnRate: 300, realTime: true,
    }
    const sheet = genesisHackSheet({ choices: all, unknown: [] }, 'League <ROM>')
    const items = sheet.sections.flatMap((section) => section.items)
    expect(items.map((item) => item.title).sort()).toEqual(Object.values(HACK_TITLES).sort())
    for (const item of items) expect(item.text.length, item.title).toBeGreaterThan(20)
    expect(items.find((item) => item.title === 'Goalie hold time')!.text).toMatch(/as long as he likes/)
    expect(items.find((item) => item.title === 'Energy gained on the bench')!.text).toMatch(/more slowly/)
    expect(items.find((item) => item.title === 'Goalie range up the ice')!.text).toMatch(/farther out/)

    const page = hackSheetHtml(sheet, new Date('2026-11-08T12:00:00Z'))
    expect(page).toContain('<title>Hacks in League &lt;ROM&gt;</title>')
    expect(page).toContain('2026-11-08')
    expect(page).not.toContain('<ROM>')

    const none = genesisHackSheet({ choices: NO_HACKS, unknown: ['clock'] }, 'stock')
    expect(none.sections).toEqual([])
    expect(none.unread).toEqual(['Real-time clock'])
    expect(hackSheetHtml(none)).toContain('None: this ROM plays as the original game.')
  })
})

describe('the hack sheet for Discord', () => {
  it('splits it into messages Discord takes, between lines, every hack in one', () => {
    const all: HackChoices = {
      ...NO_HACKS,
      weightFix: 'on', bodychecks: 'on', secondAssist: true, plusMinus: true, wideRatings: true, bonuses: 'disabled',
      threeStars: 'linesOn', baseWeight: 144, checkFix: 'all120', aggressionFix: true, ppPkFix: true, comebackFix: true,
      passFix: true, faceoffFix: true, runawayFix: true, penaltyShotTableFix: true, penaltyShotFixes: true,
      goaliePullFix: true, blindRingFix: true, snipingFix: true, awarenessFix: true, crowdFix: true, stickShots: true,
      goalieHold: 0, goalieWidth: 40, goalieOut: 224, goalieLine: 144, stamina: true, energyDrain: 65,
      energyRecovery: 6, speedBurst: 24, turnRate: 300, realTime: true,
    }
    const sheet = genesisHackSheet({ choices: all, unknown: ['goalieHold'] }, 'league')
    const messages = hackSheetDiscord(sheet)
    expect(messages.length).toBeGreaterThan(1)
    messages.forEach((message, i) => {
      expect(message.length).toBeLessThanOrEqual(2000)
      expect(message.endsWith(`(${i + 1}/${messages.length})`)).toBe(true)
    })
    const text = messages.join('\n')
    for (const item of sheet.sections.flatMap((section) => section.items)) expect(text).toContain(`- **${item.title}**: ${item.text}`)
    expect(text).toContain('Also changed, in code NOSE4Web does not know: Goalie hold time.')
    expect(hackSheetDiscord(genesisHackSheet({ choices: NO_HACKS, unknown: [] }, 'stock'))).toEqual([
      "**Hacks in stock** (NHL '94 for the Genesis)\nNone: it plays as the original game.",
    ])
  })
})
