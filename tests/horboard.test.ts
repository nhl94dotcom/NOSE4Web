import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pictureToImage } from '../src/core/graphics'
import { horBoardBytes, readHorBoard, withHorBoardBytes, withHorBoardImage, withOriginalHorBoard } from '../src/core/horboard'
import { buildRom, openRom } from '../src/core/rom'

// The side-on scoreboard screen's picture (horboard.ts, Genesis NHL 94).

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))

describe.skipIf(!existsSync(path('nhl94.bin')))('the side-on scoreboard picture', () => {
  it('reads the original, puts its own export back looking the same, and puts the original back byte for byte', () => {
    const project = openRom(new Uint8Array(readFileSync(path('nhl94.bin'))))
    const board = readHorBoard(project)!
    expect(board.original).toBe(true)
    expect(board.tiles).toBe(212)
    const rgba = pictureToImage(board.picture, board.palette)
    const { project: on, tiles } = withHorBoardImage(project, rgba, 256, 224)
    expect(tiles).toBeLessThanOrEqual(212)
    // Both pointers moved together: the map's to the picture, the tiles' 8 bytes on.
    const readU32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    expect(readU32(on.bytes, 0x12bc8)).toBe(readU32(on.bytes, 0x12bbe) + 8)
    const again = readHorBoard(openRom(buildRom(on)))!
    expect(again.original).toBe(false)
    const after = pictureToImage(again.picture, again.palette)
    let differ = 0
    for (let i = 0; i < 256 * 224 * 4; i++) if (after[i] !== rgba[i]) differ++
    expect(differ).toBe(0)
    // Its bytes for a project file, and the original back.
    const bytes = horBoardBytes(on)!
    expect(horBoardBytes(withHorBoardBytes(project, bytes))).toEqual(bytes)
    const back = withOriginalHorBoard(on)
    expect(Buffer.compare(Buffer.from(back.bytes.subarray(0, project.bytes.length)), Buffer.from(project.bytes))).toBe(0)
  })

  it('refuses a picture with more squares than the screen has room for', () => {
    const project = openRom(new Uint8Array(readFileSync(path('nhl94.bin'))))
    let seed = 7
    const noise = new Uint8ClampedArray(256 * 224 * 4).map((_, i) => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      return i % 4 === 3 ? 255 : seed >>> 24
    })
    expect(() => withHorBoardImage(project, noise, 256, 224)).toThrow(/room for 454/)
  })
})

it.skipIf(!existsSync(path('NHL95/NHL_95.bin')))("NHL '95 has no such screen", () => {
  expect(readHorBoard(openRom(new Uint8Array(readFileSync(path('NHL95/NHL_95.bin')))))).toBeNull()
})
