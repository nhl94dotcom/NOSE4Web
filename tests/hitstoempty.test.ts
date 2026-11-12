import { describe, expect, it } from 'vitest'
import { HITS_ONLY } from '../src/core/hacks'
import { HITS_TO_EMPTY } from '../src/core/hitstoempty'
import { SNES_HITS_ONLY } from '../src/core/sneshacks'

describe('knockdowns to empty a skater', () => {
  it('splits 4095 between the knockdowns, a hold half of one, and 3 is Energy from hits only', () => {
    for (const row of HITS_TO_EMPTY) {
      expect(row.knockdown * row.hits).toBeLessThanOrEqual(4095)
      expect((row.knockdown + 1) * row.hits).toBeGreaterThan(4095)
      expect(row.hold).toBe(Math.ceil(row.knockdown / 2))
    }
    const three = HITS_TO_EMPTY.find((row) => row.hits === 3)!
    expect({ hitEnergy: three.knockdown, holdEnergy: three.hold }).toEqual({ hitEnergy: HITS_ONLY.hitEnergy, holdEnergy: HITS_ONLY.holdEnergy })
    expect({ hitEnergy: three.knockdown, holdEnergy: three.hold }).toEqual(SNES_HITS_ONLY)
    expect(HITS_TO_EMPTY.find((row) => row.hits === 5)).toEqual({ hits: 5, knockdown: 819, hold: 410 })
  })
})
