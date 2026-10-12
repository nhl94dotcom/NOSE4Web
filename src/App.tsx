import { Fragment, useEffect, useMemo, useState } from 'react'
import { BulkPage } from './BulkPage'
import { CheckPage } from './CheckPage'
import { ComparePage } from './ComparePage'
import { CsvPanel } from './CsvPanel'
import { checkProject } from './core/check'
import { expandTeamSpace, nextExpansion } from './core/expand'
import { SUPPORTED_GAMES } from './core/games'
import { emptyLineSlots } from './core/lines'
import { resetTeam, teamChanged } from './core/reset'
import { buildPatch, buildRom, openRom, type RomProject } from './core/rom'
import { transferPlayers } from './core/roster'
import { teamDisplayName, teamLabels, teamSpace, type Team } from './core/team'
import { cleanFileName, download } from './download'
import { GraphicsEditor } from './GraphicsEditor'
import { HelpPage } from './HelpPage'
import { ImportTeamPage } from './ImportTeamPage'
import { LeaguePage } from './LeaguePage'
import { PicturesPage } from './PicturesPage'
import { ProjectPage } from './ProjectPage'
import { useProjectHistory } from './history'
import { RinkEditor } from './RinkEditor'
import { clearSession, loadSession, saveSession, type Session } from './session'
import { SettingsEditor } from './SettingsEditor'
import { TeamEditor, type RosterSort } from './TeamEditor'
import { TradePage } from './TradePage'
import './App.css'

// Sidebar entries that are not teams.
const RINK = -1
const SETTINGS = -2
const CSV = -3
const HELP = -4
const CHECK = -5
const COMPARE = -6
const LEAGUE = -7
const BULK = -8
const IMPORT_TEAM = -9
const PICTURES = -10
const TRADE = -11
const PROJECT = -12

// How long after the last edit the work in progress is stored.
const SESSION_SAVE_DELAY_MS = 800

const isTextField = (target: EventTarget | null) =>
  target instanceof HTMLElement && target.matches('input:not([type=checkbox]):not([type=range]), textarea')

export default function App() {
  const { project, change, reset, undo, redo, newStep, canUndo, canRedo } = useProjectHistory()
  // The project as it was when opened or last downloaded. Every edit makes a
  // new project object, so a different object means there is unsaved work.
  const [saved, setSaved] = useState<RomProject | null>(null)
  const unsaved = project !== saved
  // Names the downloaded ROM and starts the name of every spreadsheet file.
  const [name, setName] = useState('')
  const [selected, setSelected] = useState(0)
  // The team last looked at, which pages about teams start from.
  const [lastTeam, setLastTeam] = useState(0)
  if (selected >= 0 && selected !== lastTeam) setLastTeam(selected)
  const [error, setError] = useState('')
  const [rawAttributes, setRawAttributes] = useState(false)
  const [quickKeys, setQuickKeys] = useState(false)
  const [rosterSort, setRosterSort] = useState<RosterSort>('roster')
  // Whether the help is showing before any ROM has been opened.
  const [welcomeHelp, setWelcomeHelp] = useState(false)
  // Work stored by an earlier visit, offered on the welcome screen.
  const [earlier, setEarlier] = useState<Session | null>(null)

  useEffect(() => {
    void loadSession().then(setEarlier)
  }, [])

  // Stores the work in progress shortly after each change.
  useEffect(() => {
    if (!project) return
    const timer = setTimeout(() => void saveSession({ name, project, unsaved, savedAt: Date.now() }), SESSION_SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [project, name, unsaved])

  // Browsers show their own wording for this; the page can only ask for the warning.
  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  // Ctrl+Z and Ctrl+Y, except in a text box, where they undo typing as usual.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || isTextField(event.target)) return
      const key = event.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      event.preventDefault()
      if (key === 'y' || event.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  // Edits made in quick succession undo as one, which suits typing and
  // dragging. What a button does is always a step of its own.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!(event.target instanceof Element) || !event.target.closest('button')) return
      newStep()
      setTimeout(newStep)
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  })

  const findings = useMemo(() => (project ? checkProject(project) : []), [project])
  // The ROM as it was opened, which the Reset buttons go back to.
  const source = project?.source
  const original = useMemo(() => (source ? openRom(source) : null), [source])

  function start(opened: RomProject, openedName: string, hasUnsavedWork: boolean) {
    reset(opened)
    setSaved(hasUnsavedWork ? null : opened)
    setName(openedName)
    setSelected(0)
    setError('')
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (unsaved && !window.confirm('You have changes that have not been downloaded. Open another ROM and lose them?')) return
    try {
      start(openRom(new Uint8Array(await file.arrayBuffer())), file.name.replace(/\.(bin|smd|md|gen)$/i, ''), false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function updateTeam(index: number, team: Team) {
    change((p) => ({ ...p, teams: p.teams.map((t, i) => (i === index ? team : t)) }))
  }

  // Returns a message if the move cannot be made.
  function movePlayers(from: number, indexes: number[], to: number): string {
    if (!project) return ''
    try {
      change({ ...project, teams: transferPlayers(project.teams, from, indexes, to) })
      return ''
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }

  function handleDownload(asPatch: boolean) {
    if (!project) return
    try {
      if (asPatch) download(buildPatch(project), `${name || 'rom'}.ips`, 'application/octet-stream')
      else download(buildRom(project), `${name || 'rom'}.bin`, 'application/octet-stream')
      setSaved(project)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const picker = (
    <label className="button">
      Open ROM…
      <input
        type="file"
        accept=".bin,.smd,.md,.gen"
        hidden
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = '' // so the same file can be opened again
        }}
      />
    </label>
  )

  if (!project && welcomeHelp) {
    return (
      <div className="app">
        <header>
          <strong>NOSE4Web</strong>
          {picker}
          <button onClick={() => setWelcomeHelp(false)}>Back</button>
        </header>
        {error && <p className="error">{error}</p>}
        <div className="body">
          <HelpPage />
        </div>
      </div>
    )
  }

  if (!project || !original) {
    return (
      <main className="welcome">
        <h1>NOSE4Web</h1>
        <p>An editor for NHL 94 on the Sega Genesis: rosters, lines, colours and game settings.</p>
        <p>
          {picker} <button onClick={() => setWelcomeHelp(true)}>How to use it</button>
        </p>
        {earlier && (
          <p>
            <button onClick={() => start(earlier.project, earlier.name, earlier.unsaved)}>
              Continue editing {earlier.name}
            </button>{' '}
            <button
              onClick={() => {
                void clearSession()
                setEarlier(null)
              }}
            >
              Discard it
            </button>
            <br />
            <span className="note">
              Kept in this browser from {new Date(earlier.savedAt).toLocaleString()}
              {earlier.unsaved && ', with changes not yet downloaded'}.
            </span>
          </p>
        )}
        <p className="note">
          Your ROM is read and edited in this browser tab. It is never uploaded, and no ROM comes with this site.
        </p>
        <p className="note">Supported ROMs: {SUPPORTED_GAMES.join(', ')}, as .bin or .smd files.</p>
        <p className="note">
          Based on NOSE, the NHL Old Skool Editor for Windows by wboy, whose work mapping these games made this
          possible.
        </p>
        {error && <p className="error">{error}</p>}
      </main>
    )
  }

  const space = teamSpace(project.teams, project.layout)
  const left = space.available - space.used
  const expansion = nextExpansion(project)
  const grows = expansion !== null && expansion.romSize > project.bytes.length
  const teamNames = teamLabels(project.teams, project.game)
  // Where a ROM has several leagues, the team that starts each.
  const groupStarts = new Map<number, string>()
  project.game.teamGroups.reduce((at, group) => (groupStarts.set(at, group.name), at + group.teams), 0)
  const problems = findings.filter((finding) => finding.level === 'problem').length

  function page(current: RomProject, opened: RomProject) {
    switch (selected) {
      case RINK:
        return <RinkEditor palette={current.rinkPalette} original={opened.rinkPalette} onChange={(rinkPalette) => change({ ...current, rinkPalette })} />
      case SETTINGS:
        return (
          <SettingsEditor
            game={current.game}
            settings={current.settings}
            original={opened.settings}
            teamNames={teamNames}
            onChange={(settings) => change({ ...current, settings })}
          />
        )
      case CSV:
        return <CsvPanel project={current} setName={name || 'rom'} onChange={change} onSetNameChange={setName} />
      case CHECK:
        return <CheckPage findings={findings} onGoToTeam={setSelected} />
      case COMPARE:
        return <ComparePage project={current} name={name || 'rom'} />
      case LEAGUE:
        return <LeaguePage project={current} onGoToTeam={setSelected} />
      case BULK:
        return <BulkPage project={current} onChange={change} />
      case TRADE:
        return (
          <TradePage
            project={current}
            startTeam={lastTeam}
            rawAttributes={rawAttributes}
            onRawAttributesChange={setRawAttributes}
            onChange={change}
            onGoToTeam={setSelected}
          />
        )
      case PROJECT:
        return (
          <ProjectPage
            project={current}
            opened={opened}
            name={name || 'rom'}
            onOpen={(next, projectName) => {
              change(next)
              if (projectName) setName(projectName)
            }}
          />
        )
      case PICTURES:
        return <PicturesPage project={current} setName={name || 'rom'} onChange={change} />
      case IMPORT_TEAM:
        return <ImportTeamPage project={current} onChange={change} />
      case HELP:
        return <HelpPage />
      default:
        return (
          <TeamEditor
            key={selected}
            game={current.game}
            team={current.teams[selected]}
            original={opened.teams[selected]}
            emptySlots={emptyLineSlots(current.teams)}
            changed={teamChanged(current, opened, selected)}
            onResetAll={() => change(resetTeam(current, opened, selected))}
            onChange={(team) => updateTeam(selected, team)}
            rawAttributes={rawAttributes}
            onRawAttributesChange={setRawAttributes}
            quickKeys={quickKeys}
            onQuickKeysChange={setQuickKeys}
            rosterSort={rosterSort}
            onRosterSortChange={setRosterSort}
            otherTeams={teamNames.map((teamName, index) => ({ teamName, index })).filter((t) => t.index !== selected)}
            onMovePlayers={(indexes, to) => movePlayers(selected, indexes, to)}
            footer={
              current.graphicsSupported && (
                <GraphicsEditor project={current} team={selected} onChange={change} />
              )
            }
          />
        )
    }
  }

  const entry = (id: number, label: string) => (
    <button className={selected === id ? 'active' : ''} onClick={() => setSelected(id)}>
      {label}
    </button>
  )

  return (
    <div className="app">
      <header>
        <strong>NOSE4Web</strong>
        <span>{project.game.title}</span>
        <label title="Names the downloaded ROM and starts the name of every spreadsheet file.">
          Name{' '}
          <input className="rom-name" value={name} onChange={(e) => setName(cleanFileName(e.target.value))} />
        </label>
        <button title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          Undo
        </button>
        <button title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
          Redo
        </button>
        {unsaved && <span className="note">Not downloaded yet</span>}
        <span className={left < 0 ? 'space over' : 'space'}>
          {space.team === undefined
            ? left < 0
              ? `${-left} bytes over the limit`
              : `${left} bytes free`
            : left < 0
              ? `${teamNames[space.team]} is ${-left} bytes too large`
              : `At least ${left} bytes free for each team`}
        </span>
        {expansion && (
          <button
            title={
              expansion.step === 'introText'
                ? 'Moves the opening screen text to the end of the ROM to make room for rosters.'
                : 'Moves the playoff draw tables to the end of the ROM to make room for rosters.'
            }
            onClick={() => change(expandTeamSpace(project))}
          >
            Add {expansion.gain} bytes of roster space
            {grows && ` (ROM grows to ${expansion.romSize / 0x100000} MB)`}
          </button>
        )}
        {picker}
        <button onClick={() => handleDownload(false)} disabled={left < 0}>
          Download ROM
        </button>
        <button
          title="An IPS patch holds only your changes. Anyone with the same ROM you opened can apply it to get your version, so you can share your work without sharing the ROM."
          onClick={() => handleDownload(true)}
          disabled={left < 0}
        >
          Download patch
        </button>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="body">
        <nav>
          {project.teams.map((team, i) => (
            <Fragment key={i}>
              {groupStarts.has(i) && <div className="group">{groupStarts.get(i)}</div>}
              <button className={i === selected ? 'active' : ''} onClick={() => setSelected(i)}>
                {groupStarts.size > 0 ? teamDisplayName(team) : teamNames[i]}
              </button>
            </Fragment>
          ))}
          {entry(RINK, 'Rink colours')}
          {project.game.settingsSupported && entry(SETTINGS, 'Game settings')}
          {entry(LEAGUE, 'League')}
          {entry(TRADE, project.freeAgents.length > 0 ? `Trade (${project.freeAgents.length} free)` : 'Trade')}
          {entry(BULK, 'Bulk changes')}
          {entry(IMPORT_TEAM, 'Import a team')}
          {entry(CSV, 'Spreadsheet files')}
          {project.graphicsSupported && entry(PICTURES, 'Picture files')}
          {entry(PROJECT, 'Project file')}
          {entry(CHECK, problems > 0 ? `Check ROM (${problems})` : 'Check ROM')}
          {entry(COMPARE, 'Compare ROMs')}
          {entry(HELP, 'Help')}
        </nav>
        {page(project, original)}
      </div>
    </div>
  )
}
