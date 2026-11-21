import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GENESIS_HACK_GROUPS, SNES_HACK_GROUPS } from '../src/core/hackgroups'
import { HACK_TITLES, NO_HACKS } from '../src/core/hacks'
import { NHL95_HACK_SECTIONS } from '../src/core/nhl95hacks'
import { openRom } from '../src/core/rom'
import { SNES_HACKS } from '../src/core/sneshacks'
import { HacksPage } from '../src/HacksPage'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))

describe('the Hacks pages and sheets group the hacks one way', () => {
  it('has every hack in exactly one group, on both systems', () => {
    const genesis = GENESIS_HACK_GROUPS.flatMap((group) => group.hacks)
    expect([...genesis].sort()).toEqual(Object.keys(NO_HACKS).sort())
    const snes = SNES_HACK_GROUPS.flatMap((group) => group.hacks)
    expect([...snes].sort()).toEqual([...SNES_HACKS].sort())
    // The sections both systems have come in the same order.
    const shared = (groups: { id: string }[], other: { id: string }[]) => groups.map((g) => g.id).filter((id) => other.some((o) => o.id === id))
    expect(shared(SNES_HACK_GROUPS, GENESIS_HACK_GROUPS)).toEqual(shared(GENESIS_HACK_GROUPS, SNES_HACK_GROUPS))
    // NHL '95's page has the same sections, titles and order.
    expect(shared(NHL95_HACK_SECTIONS, GENESIS_HACK_GROUPS)).toEqual(NHL95_HACK_SECTIONS.map((s) => s.id))
    expect(shared(NHL95_HACK_SECTIONS, GENESIS_HACK_GROUPS)).toEqual(shared(GENESIS_HACK_GROUPS, NHL95_HACK_SECTIONS))
    expect(shared(SNES_HACK_GROUPS, GENESIS_HACK_GROUPS)).toEqual(SNES_HACK_GROUPS.map((g) => g.id))
    for (const group of [...SNES_HACK_GROUPS, ...NHL95_HACK_SECTIONS]) expect(group.title).toBe(GENESIS_HACK_GROUPS.find((g) => g.id === group.id)!.title)
  })

  it.skipIf(!existsSync(romPath))('shows the Genesis groups on the page, in order, each hack in its own', () => {
    const project = openRom(new Uint8Array(readFileSync(romPath)))
    const html = renderToStaticMarkup(<HacksPage project={project} name="nhl94" onChange={() => {}} />)
    const sections = [...html.matchAll(/<section id="hacks-([a-z]+)"[^>]*>(.*?)<\/section>/gs)].map((m) => ({ id: m[1], html: m[2] }))
    expect(sections.map((s) => s.id)).toEqual([...GENESIS_HACK_GROUPS.map((g) => g.id), 'apply'])
    for (const group of GENESIS_HACK_GROUPS) {
      const section = sections.find((s) => s.id === group.id)!.html
      expect(section).toContain(`<h3>${group.title}</h3>`)
      // Each hack's title, in the group's order (Edit Lines for fewer skaters shows only where a ROM needs it).
      const shown = group.hacks.filter((key) => key !== 'fewerSkaterLines')
      const at = shown.map((key) => section.indexOf(`<b>${HACK_TITLES[key].replace(/'/g, '&#x27;')}</b>`))
      expect(at.every((i) => i >= 0), `${group.id}: ${shown.filter((_, i) => at[i] < 0).join(', ')}`).toBe(true)
      expect([...at].sort((a, b) => a - b)).toEqual(at)
    }
    // The options the recommended fixes set are marked (the legacy weight fix, which they turn off, is not).
    const tagged = (key: keyof typeof NO_HACKS) => html.split(`<b>${HACK_TITLES[key].replace(/'/g, '&#x27;')}</b>`)[1].split('</label>')[0].includes('Recommended')
    expect(tagged('checkFix')).toBe(true)
    expect(tagged('bCheckPenaltiesOff')).toBe(true)
    expect(tagged('weightFix')).toBe(false)
    expect(tagged('snipingFix')).toBe(false)
  })
})
