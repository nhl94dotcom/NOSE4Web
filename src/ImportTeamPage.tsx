import { useEffect, useState } from 'react'
import { ALL_PARTS, importTeam, importTeams, teamsByName, type ImportParts } from './core/importteam'
import { openRom, type RomProject } from './core/rom'
import { teamLabels } from './core/team'
import type { ImportKept } from './pagedrafts'

// `snes` is the label for the SNES game, where it differs.
const PARTS: { key: keyof ImportParts; label: string; snes?: string }[] = [
  { key: 'names', label: 'Names' },
  { key: 'roster', label: 'Roster and lines' },
  { key: 'colours', label: 'Home and away colours', snes: 'Home and away colours, and name banner colours' },
  { key: 'pictures', label: 'Logos, banners and banner colours', snes: 'Logos: team, centre ice and score logos' },
  { key: 'photos', label: 'Player photos (with the roster)' },
]

interface Other {
  fileName: string
  project: RomProject
}

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
  // The other ROM and the choices, kept while other pages show (pagedrafts.ts).
  kept: ImportKept | null
  onKeep: (kept: ImportKept | null) => void
}

export function ImportTeamPage({ project, onChange, kept: left, onKeep }: Props) {
  // Kept choices come back while the import is not made; once it is, the page starts afresh, as it always did.
  const kept = left?.dirty ? left : null
  const [other, setOther] = useState<Other | null>(kept ? { fileName: kept.fileName, project: kept.other } : null)
  const [from, setFrom] = useState(kept?.from ?? 0)
  const [to, setTo] = useState(kept && kept.to < project.teams.length ? kept.to : 0)
  const [parts, setParts] = useState(kept?.parts ?? ALL_PARTS)
  // Opened or changed since the last import, which is what the reminder on other pages goes by.
  const [dirty, setDirty] = useState(kept?.dirty ?? false)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  // Every team at once: the teams left out of the ones matched by name, what comes, and what it brought.
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [many, setMany] = useState({ colours: true, pictures: true })
  // Each note once, with the teams it is for.
  const [manyNotes, setManyNotes] = useState<{ note: string; teams: string[] }[]>([])
  // While teams are being brought in: how many are done, of how many.
  const [working, setWorking] = useState<[number, number] | null>(null)
  useEffect(
    () => onKeep(other ? { fileName: other.fileName, other: other.project, from, to, parts, dirty } : null),
    [other, from, to, parts, dirty, onKeep],
  )

  async function open(file: File | undefined) {
    if (!file) return
    try {
      setOther({ fileName: file.name, project: openRom(new Uint8Array(await file.arrayBuffer())) })
      setFrom(0)
      setDirty(true)
      setError('')
      setNotes([])
      setSkipped(new Set())
      setManyNotes([])
    } catch (e) {
      setOther(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function bringIn() {
    if (!other) return
    try {
      const result = importTeam(project, other.project, from, to, parts)
      onChange(result.project)
      setDirty(false)
      setNotes(result.notes)
      setError('')
    } catch (e) {
      setNotes([])
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // One team at a time, letting the page show how far it has got (each SNES logo is fitted in turn, which takes a
  // moment); the ROM changes once, at the end, so Undo takes it all back.
  async function bringInMany(pairs: { from: number; to: number }[]) {
    if (!other || working) return
    let next = project
    const byNote = new Map<string, string[]>()
    try {
      for (let i = 0; i < pairs.length; i++) {
        setWorking([i, pairs.length])
        await new Promise((resolve) => setTimeout(resolve, 0))
        const result = importTeams(next, other.project, [pairs[i]], many)
        next = result.project
        for (const note of result.notes[0].notes) byNote.set(note, [...(byNote.get(note) ?? []), ours[pairs[i].to]])
      }
      onChange(next)
      setManyNotes([...byNote].map(([note, teams]) => ({ note, teams })))
      setError('')
    } catch (e) {
      setManyNotes([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setWorking(null)
    }
  }

  const theirs = other ? teamLabels(other.project.teams, other.project.game) : []
  const ours = teamLabels(project.teams, project.game)
  const nothingChosen = !Object.values(parts).some(Boolean)

  // Logos and colours for every team the two ROMs share, matched by name: say, the current logos from a league's ROM.
  function manySection() {
    if (!other) return null
    if (other.project.game.platform !== project.game.platform) {
      return (
        <>
          <h3>Every team at once</h3>
          <p className="note">
            Logos and colours for every team come only from a ROM for the same console: the Genesis and the SNES keep
            them in different ways. Picture files can carry them across as PNG pictures instead.
          </p>
        </>
      )
    }
    const pairs = teamsByName(project, other.project)
    const chosen = pairs.filter((p) => !skipped.has(p.to))
    const unmatched = ours.filter((_, i) => !pairs.some((p) => p.to === i))
    return (
      <>
        <h3>Every team at once</h3>
        <p className="note">
          Brings logos and colours in for each team both ROMs have, matched by name: for example, a league ROM's
          logos for the teams of a real season. Names, rosters and photos stay as they are, and Undo takes it all back.
        </p>
        {pairs.length === 0 ? (
          <p className="note">No team in the other ROM has the name of a team here.</p>
        ) : (
          <>
            <ul className="many-teams">
              {pairs.map(({ from: f, to: t }) => (
                <li key={t}>
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={!skipped.has(t)}
                      onChange={(e) => {
                        const next = new Set(skipped)
                        if (e.target.checked) next.delete(t)
                        else next.add(t)
                        setSkipped(next)
                      }}
                    />{' '}
                    {ours[t]}
                    {theirs[f] !== ours[t] ? ` (from ${theirs[f]})` : ''}
                  </label>
                </li>
              ))}
            </ul>
            {unmatched.length > 0 && <p className="note">No match in the other ROM: {unmatched.join(', ')}.</p>}
            <p>
              <label className="choice">
                <input type="checkbox" aria-label="Colours for every team" checked={many.colours} onChange={(e) => setMany({ ...many, colours: e.target.checked })} />{' '}
                {project.game.platform === 'snes' ? 'Home and away colours, and name banner colours' : 'Home and away colours'}
              </label>
              <label className="choice">
                <input type="checkbox" aria-label="Logos for every team" checked={many.pictures} onChange={(e) => setMany({ ...many, pictures: e.target.checked })} />{' '}
                {project.game.platform === 'snes' ? 'Logos: team, centre ice and score logos' : 'Logos, banners and banner colours'}
              </label>
            </p>
            <p>
              <button disabled={working !== null || chosen.length === 0 || (!many.colours && !many.pictures)} onClick={() => void bringInMany(chosen)}>
                Bring in for {chosen.length} {chosen.length === 1 ? 'team' : 'teams'}
              </button>{' '}
              {working && (
                <span className="note">
                  Working: {working[0]} of {working[1]} teams done…
                </span>
              )}
            </p>
            {manyNotes.length > 0 && (
              <ul>
                {manyNotes.map((n, i) => (
                  <li key={i}>
                    {n.note.replace(/\.$/, '')} ({n.teams.length === chosen.length && n.teams.length > 1 ? `all ${n.teams.length} teams` : n.teams.join(', ')}).
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </>
    )
  }

  return (
    <main className="team help">
      <h2>Import a team</h2>
      <p className="note">
        Brings one team in from another ROM, replacing a team here: a team an owner edited in their own copy, say,
        or one from last season. The other ROM is only read. Everything else in the editor stays as it is, and Undo
        takes the import back.
      </p>
      <p>
        <label className="button">
          Choose the other ROM…
          <input
            type="file"
            accept=".bin,.smd,.md,.gen,.smc,.sfc"
            hidden
            onChange={(e) => {
              void open(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>{' '}
        {other && (
          <span className="note">
            {other.fileName}: {other.project.game.title}, {theirs.length} teams.
          </span>
        )}
      </p>
      {error && <p className="error">{error}</p>}
      {other && (
        <>
          <div className="fields">
            <label>
              Take
              <select
                className="wide"
                aria-label="Team to take"
                value={from}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  setFrom(next)
                  setDirty(true)
                  // The team of the same name here is the likely one to replace;
                  // failing that, the one in the same place.
                  const named = ours.indexOf(theirs[next])
                  if (named >= 0) setTo(named)
                  else if (next < ours.length) setTo(next)
                }}
              >
                {theirs.map((name, i) => (
                  <option key={i} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To replace
              <select className="wide" aria-label="Team to replace" value={to} onChange={(e) => {
                  setTo(Number(e.target.value))
                  setDirty(true)
                }}>
                {ours.map((name, i) => (
                  <option key={i} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>
            {PARTS.map((part) => (
              <label key={part.key} className="choice">
                <input
                  type="checkbox"
                  checked={parts[part.key] ?? false}
                  onChange={(e) => {
                    setParts({ ...parts, [part.key]: e.target.checked })
                    setDirty(true)
                  }}
                />{' '}
                {project.game.platform === 'snes' ? (part.snes ?? part.label) : part.label}
              </label>
            ))}
          </p>
          <p>
            <button disabled={nothingChosen} onClick={bringIn}>
              Import {theirs[from]} over {ours[to]}
            </button>
          </p>
          {notes.length > 0 && (
            <ul>
              {notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
          <p className="note">
            The centre-ice logo is drawn with the home colours, so it looks right only if the colours come too. A
            bigger roster needs more room in the ROM; watch the bytes free at the top of the page.
          </p>
          {manySection()}
        </>
      )}
    </main>
  )
}
