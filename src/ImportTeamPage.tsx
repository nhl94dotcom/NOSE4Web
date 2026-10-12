import { useState } from 'react'
import { ALL_PARTS, importTeam, type ImportParts } from './core/importteam'
import { openRom, type RomProject } from './core/rom'
import { teamDisplayName } from './core/team'

const PARTS: { key: keyof ImportParts; label: string }[] = [
  { key: 'names', label: 'Names' },
  { key: 'roster', label: 'Roster and lines' },
  { key: 'colours', label: 'Home and away colours' },
  { key: 'pictures', label: 'Logos, banners and banner colours' },
]

interface Other {
  fileName: string
  project: RomProject
}

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
}

export function ImportTeamPage({ project, onChange }: Props) {
  const [other, setOther] = useState<Other | null>(null)
  const [from, setFrom] = useState(0)
  const [to, setTo] = useState(0)
  const [parts, setParts] = useState(ALL_PARTS)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState<string[]>([])

  async function open(file: File | undefined) {
    if (!file) return
    try {
      setOther({ fileName: file.name, project: openRom(new Uint8Array(await file.arrayBuffer())) })
      setFrom(0)
      setError('')
      setNotes([])
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
      setNotes(result.notes)
      setError('')
    } catch (e) {
      setNotes([])
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const theirs = other?.project.teams.map(teamDisplayName) ?? []
  const ours = project.teams.map(teamDisplayName)
  const nothingChosen = !Object.values(parts).some(Boolean)

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
            accept=".bin,.smd,.md,.gen"
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
                  // The same team is usually in the same place in both ROMs.
                  if (next < ours.length) setTo(next)
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
              <select className="wide" aria-label="Team to replace" value={to} onChange={(e) => setTo(Number(e.target.value))}>
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
                  checked={parts[part.key]}
                  onChange={(e) => setParts({ ...parts, [part.key]: e.target.checked })}
                />{' '}
                {part.label}
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
            bigger roster needs more room in the ROM; watch the space meter at the top.
          </p>
        </>
      )}
    </main>
  )
}
