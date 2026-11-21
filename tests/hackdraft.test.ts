import { describe, expect, it } from 'vitest'
import { rebase } from '../src/hackdraft'

// Hack choices kept while other pages show are laid on the ROM as it is now: only what the user changed carries over.
describe('kept hack choices', () => {
  it('keeps what was changed from the base, and takes the rest from the ROM as it is now', () => {
    const base = { a: false, b: 'x', c: 3 }
    const wanted = { a: true, b: 'x', c: 3 }
    // Since then something else (Undo, another page) changed b and c.
    expect(rebase({ a: false, b: 'y', c: 4 }, base, wanted)).toEqual({ a: true, b: 'y', c: 4 })
    // Once applied, the ROM has them: nothing is left to change.
    const now = { a: true, b: 'x', c: 3 }
    expect(rebase(now, base, wanted)).toEqual(now)
    // Nothing kept: the ROM's own, the same object.
    expect(rebase(now, undefined, undefined)).toBe(now)
    // A choice this ROM does not have is not brought in.
    expect(rebase({ a: false }, { a: false, z: 1 }, { a: false, z: 2 })).toEqual({ a: false })
  })
})
