import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compareProjects } from '../src/core/compare'
import { rinkLogo, withMenuLogo, menuLogo, menuLogoPalette, withRinkLogo } from '../src/core/graphics'
import { buildRom, openRom } from '../src/core/rom'
import { snesLogo } from '../src/core/snespictures'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const lines = (sections: { heading: string; changes: string[] }[]) => sections.flatMap((s) => s.changes.map((c) => `${s.heading}: ${c}`))

describe.skipIf(!existsSync(path('nhl94.bin')))('comparing Genesis logos and banners', () => {
  const stock = () => openRom(new Uint8Array(readFileSync(path('nhl94.bin'))))

  it('names each picture that changed, and nothing for one unchanged', () => {
    const before = stock()
    expect(lines(compareProjects(before, before))).toEqual([])
    const ice = rinkLogo(before, 1)
    const pixels = ice.pixels.slice()
    pixels[pixels.findIndex((p) => p !== 0)] = 0
    let after = { ...before, graphics: withRinkLogo(before, 1, { ...ice, pixels }) }
    // A menu logo's own colours count as the picture's.
    const palette = menuLogoPalette(before, 2).slice()
    palette[7] = palette[7] ^ 0x0e
    after = { ...after, graphics: withMenuLogo(after, 2, menuLogo(after, 2), palette) }
    const found = lines(compareProjects(before, after)).filter((line) => line.includes('logo'))
    expect(found).toHaveLength(2)
    expect(found[0]).toMatch(/^Boston.*: Centre-ice logo changed\.$/)
    expect(found[1]).toMatch(/^Buffalo.*: Menu logo changed\.$/)
    // Downloaded and opened again, it is still found against the original.
    const reopened = openRom(buildRom(after))
    expect(lines(compareProjects(before, reopened)).filter((line) => line.includes('logo'))).toEqual(found)
  })

  it.skipIf(!local.league30Rom || !existsSync(path(local.league30Rom)))('compares two whole ROMs quickly', () => {
    const league = openRom(new Uint8Array(readFileSync(path(local.league30Rom!))))
    const start = performance.now()
    const found = lines(compareProjects(stock(), league)).filter((line) => / (logo|banner)( \(.*\))? changed\.$/.test(line))
    expect(found.length).toBeGreaterThan(0)
    expect(performance.now() - start).toBeLessThan(3000)
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('comparing SNES logos', () => {
  it('names the team logo and the centre ice logo where they changed', () => {
    const before = openRom(new Uint8Array(readFileSync(path('NHL94.smc'))))
    expect(lines(compareProjects(before, before))).toEqual([])
    const teams = before.teams.length
    const logo = snesLogo(before.bytes, teams, before.snesPictures!, 1)
    const palette = logo.palette.slice()
    palette[3] ^= 0x1f
    const after = { ...before, snesPictures: { ...before.snesPictures!, logos: { 1: { picture: logo.picture, palette } } } }
    expect(lines(compareProjects(before, after)).filter((line) => line.includes('logo'))).toEqual([expect.stringMatching(/: Team logo changed\.$/)])
  })
})
