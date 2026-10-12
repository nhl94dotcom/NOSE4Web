import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { openRom } from '../src/core/rom'
import { HelpPage } from '../src/HelpPage'
import { TeamEditor } from '../src/TeamEditor'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))

it('renders the help page with every section its contents list links to', () => {
  const html = renderToStaticMarkup(<HelpPage />)
  const links = [...html.matchAll(/href="#(help-[a-z]+)"/g)].map((m) => m[1])
  expect(links.length).toBeGreaterThan(10)
  for (const id of links) expect(html).toContain(`id="${id}"`)
  expect(html).toContain('_players.csv')
})

it.skipIf(!existsSync(romPath))('renders every team without errors', () => {
  const project = openRom(new Uint8Array(readFileSync(romPath)))
  const rest = {
    onChange: () => {},
    rawAttributes: false,
    onRawAttributesChange: () => {},
    quickKeys: false,
    onQuickKeysChange: () => {},
  }
  for (const team of project.teams) {
    const html = renderToStaticMarkup(<TeamEditor game={project.game} team={team} {...rest} />)
    const raw = renderToStaticMarkup(<TeamEditor game={project.game} team={team} {...rest} rawAttributes />)
    expect(html).toContain('title="Stick Handling"')
    expect(html).toContain('title="Weight (pounds)"')
    expect(raw).toContain('<option value="15">15</option>')
    expect(html).not.toContain('<option value="15">15</option>')
    expect(html.split('class="name"').length - 1).toBe(team.players.length)
    expect(html).not.toContain('Invalid (')
  }
  const montreal = renderToStaticMarkup(<TeamEditor game={project.game} team={project.teams[11]} {...rest} />)
  expect(montreal).toContain('value="Patrick Roy"')
})
