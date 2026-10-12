import { useEffect, useState } from 'react'
import { CsvPanel } from './CsvPanel'
import { expandTeamSpace, nextExpansion } from './core/expand'
import { SUPPORTED_GAMES } from './core/games'
import { buildPatch, buildRom, openRom, type RomProject } from './core/rom'
import { teamSpace, type Team } from './core/team'
import { cleanFileName, download } from './download'
import { HelpPage } from './HelpPage'
import { RinkEditor } from './RinkEditor'
import { SettingsEditor } from './SettingsEditor'
import { TeamEditor } from './TeamEditor'
import './App.css'

// Sidebar entries that are not teams.
const RINK = -1
const SETTINGS = -2
const CSV = -3
const HELP = -4

export default function App() {
  const [project, setProject] = useState<RomProject | null>(null)
  // The project as it was when opened or last downloaded. Every edit makes a
  // new project object, so a different object means there is unsaved work.
  const [saved, setSaved] = useState<RomProject | null>(null)
  const unsaved = project !== saved
  // Names the downloaded ROM and starts the name of every spreadsheet file.
  const [name, setName] = useState('')
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState('')
  const [rawAttributes, setRawAttributes] = useState(false)
  const [quickKeys, setQuickKeys] = useState(false)
  // Whether the help is showing before any ROM has been opened.
  const [welcomeHelp, setWelcomeHelp] = useState(false)

  // Browsers show their own wording for this; the page can only ask for the warning.
  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (unsaved && !window.confirm('You have changes that have not been downloaded. Open another ROM and lose them?')) return
    try {
      const opened = openRom(new Uint8Array(await file.arrayBuffer()))
      setProject(opened)
      setSaved(opened)
      setName(file.name.replace(/\.(bin|smd|md|gen)$/i, ''))
      setSelected(0)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function updateTeam(index: number, team: Team) {
    setProject((p) => p && { ...p, teams: p.teams.map((t, i) => (i === index ? team : t)) })
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

  if (!project) {
    return (
      <main className="welcome">
        <h1>NOSE4Web</h1>
        <p>An editor for NHL 94 on the Sega Genesis: rosters, lines, colours and game settings.</p>
        <p>
          {picker} <button onClick={() => setWelcomeHelp(true)}>How to use it</button>
        </p>
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

  return (
    <div className="app">
      <header>
        <strong>NOSE4Web</strong>
        <span>{project.game.title}</span>
        <label title="Names the downloaded ROM and starts the name of every spreadsheet file.">
          Name{' '}
          <input className="rom-name" value={name} onChange={(e) => setName(cleanFileName(e.target.value))} />
        </label>
        {unsaved && <span className="note">Not downloaded yet</span>}
        <span className={left < 0 ? 'space over' : 'space'}>
          {left < 0 ? `${-left} bytes over the limit` : `${left} bytes free`}
        </span>
        {expansion && (
          <button
            title={
              expansion.step === 'introText'
                ? 'Moves the opening screen text to the end of the ROM to make room for rosters.'
                : 'Moves the playoff draw tables to the end of the ROM to make room for rosters.'
            }
            onClick={() => setProject(expandTeamSpace(project))}
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
            <button key={i} className={i === selected ? 'active' : ''} onClick={() => setSelected(i)}>
              {team.names[0]} {team.names[2]}
            </button>
          ))}
          <button className={selected === RINK ? 'active' : ''} onClick={() => setSelected(RINK)}>
            Rink colours
          </button>
          <button className={selected === SETTINGS ? 'active' : ''} onClick={() => setSelected(SETTINGS)}>
            Game settings
          </button>
          <button className={selected === CSV ? 'active' : ''} onClick={() => setSelected(CSV)}>
            Spreadsheet files
          </button>
          <button className={selected === HELP ? 'active' : ''} onClick={() => setSelected(HELP)}>
            Help
          </button>
        </nav>
        {selected === RINK ? (
          <RinkEditor
            palette={project.rinkPalette}
            onChange={(rinkPalette) => setProject({ ...project, rinkPalette })}
          />
        ) : selected === HELP ? (
          <HelpPage />
        ) : selected === CSV ? (
          <CsvPanel project={project} setName={name || 'rom'} onChange={setProject} onSetNameChange={setName} />
        ) : selected === SETTINGS ? (
          <SettingsEditor
            game={project.game}
            settings={project.settings}
            teamNames={project.teams.map((team) => `${team.names[0]} ${team.names[2]}`.trim())}
            onChange={(settings) => setProject({ ...project, settings })}
          />
        ) : (
          <TeamEditor
            key={selected}
            game={project.game}
            team={project.teams[selected]}
            onChange={(team) => updateTeam(selected, team)}
            rawAttributes={rawAttributes}
            onRawAttributesChange={setRawAttributes}
            quickKeys={quickKeys}
            onQuickKeysChange={setQuickKeys}
          />
        )}
      </div>
    </div>
  )
}
