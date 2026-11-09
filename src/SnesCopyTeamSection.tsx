import { useState } from 'react'
import { importTeam } from './core/importteam'
import type { RomProject } from './core/rom'
import { teamDisplayName, teamLabels } from './core/team'

interface Props {
  project: RomProject
  team: number
  onChange: (project: RomProject) => void
}

// The SNES team page's Copy to another team, as the Genesis one's: this
// team's colours, or its logos, given to another team by Import team's own
// steps, from this ROM to itself.
export function SnesCopyTeamSection({ project, team, onChange }: Props) {
  const labels = teamLabels(project.teams, project.game)
  const others = project.teams.map((_, i) => i).filter((i) => i !== team)
  const [copyTo, setCopyTo] = useState(others[0] ?? 0)
  const [copyColours, setCopyColours] = useState(true)
  const [copyPictures, setCopyPictures] = useState(true)
  const [copyNotes, setCopyNotes] = useState<{ team: number; lines: string[] } | null>(null)
  const target = others.includes(copyTo) ? copyTo : (others[0] ?? 0)

  function copyToTeam() {
    const result = importTeam(project, project, team, target, { names: false, roster: false, colours: copyColours, pictures: copyPictures })
    onChange(result.project)
    setCopyNotes({ team, lines: result.notes.map((line) => line.replace('brought in', 'copied')) })
  }

  return (
    <section>
      <h2>Copy to another team</h2>
      <p>
        <label className="choice">
          <input type="checkbox" checked={copyColours} onChange={(e) => setCopyColours(e.target.checked)} /> Home and away
          colours, and name banner colours
        </label>
        <label className="choice">
          <input type="checkbox" checked={copyPictures} onChange={(e) => setCopyPictures(e.target.checked)} /> Logos: team,
          centre ice and score logos
        </label>
      </p>
      <p>
        <button disabled={others.length === 0 || (!copyColours && !copyPictures)} onClick={copyToTeam}>
          Copy from {teamDisplayName(project.teams[team])} to
        </button>{' '}
        <select className="wide" aria-label="Team to copy colours and logos to" value={target} onChange={(e) => setCopyTo(Number(e.target.value))}>
          {others.map((other) => (
            <option key={other} value={other}>
              {labels[other]}
            </option>
          ))}
        </select>{' '}
        <span className="note">This team keeps its own; the other team's are replaced. Undo takes it back.</span>
      </p>
      {copyNotes?.team === team && (
        <ul>
          {copyNotes.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
