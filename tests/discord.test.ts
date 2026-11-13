import { describe, expect, it } from 'vitest'
import { hacksForDiscord, menuLineChanges, NO_HACKS, RECOMMENDED_FIXES, withRecommendedFixes } from '../src/core/hacks'
import { RECOMMENDED_SNES_FIXES, SNES_HACKS, withRecommendedSnesFixes, type SnesHackChoices } from '../src/core/sneshacks'

describe('the recommended fixes', () => {
  it('turns on the tested fixes, takes out the legacy one and leaves the rest', () => {
    const before = { ...NO_HACKS, weightFix: 'on' as const, faceoffFix: true, goalieHold: 300 }
    const after = withRecommendedFixes(before, ['aggressionFix'])
    expect(after).toEqual({ ...before, ...RECOMMENDED_FIXES, aggressionFix: false })
    expect(after.weightFix).toBe('off')
    expect(after.faceoffFix).toBe(true)
    expect(after.goaliePullFix).toBe(false)
    expect(after.snipingFix).toBe(false)
    expect(after.bCheckPenaltiesOff).toBe('asPenaltiesOn')
    // The three stars follow the ROM's line changes, and are left where the menu does not say.
    expect(after.threeStars).toBe('original')
    expect(withRecommendedFixes(before, [], true).threeStars).toBe('linesOn')
    expect(withRecommendedFixes(before, [], false).threeStars).toBe('linesOff')
    expect(menuLineChanges([{ caption: 'Line Changes', options: ['On', 'Off', 'Auto'], value: 2 }])).toBe(true)
    expect(menuLineChanges([{ caption: 'Line Changes', options: ['On', 'Off', 'Auto'], value: 1 }])).toBe(false)
    expect(menuLineChanges([])).toBe(undefined)

    const off = Object.fromEntries(SNES_HACKS.map((hack) => [hack, false])) as SnesHackChoices
    const snes = withRecommendedSnesFixes(off, ['extraAttackerFix'])
    expect(SNES_HACKS.filter((hack) => snes[hack]).sort()).toEqual(RECOMMENDED_SNES_FIXES.filter((hack) => hack !== 'extraAttackerFix').sort())
  })
})

describe('the Discord post', () => {
  it('lists what differs from the original game, and what the editor cannot read', () => {
    const choices = { ...NO_HACKS, checkFix: 'all240' as const, weightFix: 'simple' as const, wideRatings: true, baseWeight: 144, passFix: true, speedBurst: 24 }
    expect(hacksForDiscord({ choices, unknown: ['goalieBox', 'clock'] }, 'league')).toBe(
      [
        '**Hacks in league**',
        '- **Weight bug and C-then-B fix**: everyone checks as a person',
        '- **Rocket pass fix**',
        '- **Rating scale**: 0 to 15',
        '- **Base weight**: 144 pounds (the original game has 140 pounds)',
        '- **Speed burst**: 24',
        "- **smozoma's weight bug fix (legacy)**: the earlier, simpler fix",
        'Also changed, in code NOSE4Web does not know: Real-time clock, Goalie range to each side, Goalie range up the ice.',
      ].join('\n'),
    )
  })
})
