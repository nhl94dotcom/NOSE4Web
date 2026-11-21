import { useState } from 'react'
import { saveProjectFile } from './core/projectfile'
import type { RomProject } from './core/rom'
import { nextSeasonName, startSeason } from './core/season'
import { download } from './download'

interface Props {
  project: RomProject
  // The ROM as it was opened.
  opened: RomProject
  name: string
  onChange: (project: RomProject) => void
  onNameChange: (name: string) => void
}

// Starts a new season: the Changes page then lists what has changed since.
export function NewSeasonPage({ project, opened, name, onChange, onNameChange }: Props) {
  const season = project.baseline
  const [nextName, setNextName] = useState<string | null>(null)
  const newName = nextName ?? nextSeasonName(name)
  const [clearFreeAgents, setClearFreeAgents] = useState(false)
  const [keepCopy, setKeepCopy] = useState(true)
  const [notice, setNotice] = useState('')

  function begin() {
    // The season just ended is saved first, as it stands, under its own name.
    if (keepCopy) download(saveProjectFile(project, opened, name), `${name}_project.json`, 'application/json')
    onChange(startSeason(project, newName, { clearFreeAgents }))
    onNameChange(newName)
    setNextName(null)
    setNotice(`${newName} has begun. The Changes page lists changes from here on. Undo takes this back.`)
  }

  return (
    <main className="team help">
      <h2>Start a new season</h2>
      <p className="note">
        Marks the teams as they stand now as the season's starting point. From then on the Changes page can list what
        has changed since, however many times you close the editor or download the ROM in between. The starting point
        is kept with your work in this browser and in a project file, not in the ROM.
      </p>
      <div className="fields">
        <label>
          Name for the new season
          <input className="season-name" aria-label="Name for the new season" value={newName} onChange={(e) => setNextName(e.target.value.replace(/[\\/:*?"<>|]/g, ''))} />
        </label>
      </div>
      <p>
        <label className="choice">
          <input type="checkbox" checked={keepCopy} onChange={(e) => setKeepCopy(e.target.checked)} /> First save a
          project file of {name} as it stands
        </label>
        <label className="choice">
          <input type="checkbox" checked={clearFreeAgents} onChange={(e) => setClearFreeAgents(e.target.checked)} /> Let the{' '}
          {project.freeAgents.length} free agents go
        </label>
      </p>
      <p>
        <button disabled={newName.trim() === ''} onClick={begin}>
          Start {newName || 'the new season'}
        </button>{' '}
        <span className="note">
          {notice ||
            (season ? `This replaces the starting point of ${season.name}.` : 'The Name box at the top of the page changes to match. Your league rules carry over.')}
        </span>
      </p>
    </main>
  )
}
