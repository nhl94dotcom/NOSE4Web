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
    changed: false,
    freeAgents: [],
    onRelease: () => '',
    onSign: () => '',
    onRosterCard: () => {},
    emptySlots: [],
    onResetAll: () => {},
    onChange: () => {},
    rawAttributes: false,
    onRawAttributesChange: () => {},
    quickKeys: false,
    onQuickKeysChange: () => {},
    rosterSort: 'roster' as const,
    onRosterSortChange: () => {},
    otherTeams: [{ teamName: 'Other Team', index: 1 }],
    onMovePlayers: () => '',
  }
  for (const team of project.teams) {
    const html = renderToStaticMarkup(<TeamEditor game={project.game} team={team} original={team} {...rest} />)
    const raw = renderToStaticMarkup(<TeamEditor game={project.game} team={team} original={team} {...rest} rawAttributes />)
    expect(html).toContain('title="Stick Handling. In play: stealing and keeping the puck')
    expect(html).toContain('title="Stick Right. In play: nothing: the game looks it up and never uses it."')
    expect(html).toContain('title="Weight (pounds). In play: how quickly he speeds up')
    expect(raw).toContain('<option value="15">15</option>')
    expect(html).not.toContain('<option value="15">15</option>')
    expect(html.split('class="name"').length - 1).toBe(team.players.length)
    expect(html).not.toContain('Invalid (')
  }
  const montreal = renderToStaticMarkup(<TeamEditor game={project.game} team={project.teams[11]} original={project.teams[11]} {...rest} />)
  expect(montreal).toContain('value="Patrick Roy"')
})

const snesPath = fileURLToPath(new URL('../../NHL94.smc', import.meta.url))

it.skipIf(!existsSync(snesPath))('renders an SNES team with its overall, its colours and SNES rating notes', () => {
  const project = openRom(new Uint8Array(readFileSync(snesPath)))
  const rest = {
    changed: false,
    freeAgents: [],
    onRelease: () => '',
    onSign: () => '',
    onRosterCard: () => {},
    emptySlots: [],
    onResetAll: () => {},
    onChange: () => {},
    rawAttributes: false,
    onRawAttributesChange: () => {},
    quickKeys: false,
    onQuickKeysChange: () => {},
    rosterSort: 'roster' as const,
    onRosterSortChange: () => {},
    otherTeams: [{ teamName: 'Other Team', index: 1 }],
    onMovePlayers: () => '',
  }
  const team = project.teams[1]
  const html = renderToStaticMarkup(<TeamEditor game={project.game} team={team} original={team} {...rest} />)
  expect(html).toContain('Overall shown')
  expect(html).toContain(`value="${team.shownOverall}"`)
  expect(html).toContain('Home colours')
  expect(html).toContain('Jersey and helmet')
  expect(html).toContain('the speed of a pass to nobody, and how accurately the flip goes.')
  // The SNES screens show the top steps a little higher than the Genesis ones.
  expect(html).toContain('<option value="6">99-100</option>')
  expect(html).toContain('In play: nothing: the game looks it up and then overwrites it.')
})
