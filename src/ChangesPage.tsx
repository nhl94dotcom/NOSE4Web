import { useMemo, useState } from 'react'
import { saveProjectFile } from './core/projectfile'
import { reportIsEmpty } from './core/report'
import type { RomProject } from './core/rom'
import { changesSince, nextSeasonName, startSeason } from './core/season'
import { download } from './download'
import { ReportView } from './ReportView'

interface Props {
  project: RomProject
  // The ROM as it was opened.
  opened: RomProject
  name: string
  onChange: (project: RomProject) => void
  onNameChange: (name: string) => void
}

type Since = 'opened' | 'season'

export function ChangesPage({ project, opened, name, onChange, onNameChange }: Props) {
  const season = project.baseline
  // Since the season began, where one has; otherwise since the ROM was opened.
  const [chosen, setChosen] = useState<Since>('season')
  const since: Since = season && chosen === 'season' ? 'season' : 'opened'
  const report = useMemo(() => changesSince(project, since === 'season' && season ? season : opened), [project, opened, season, since])

  const [nextName, setNextName] = useState<string | null>(null)
  const newName = nextName ?? nextSeasonName(name)
  const [clearFreeAgents, setClearFreeAgents] = useState(false)
  const [keepCopy, setKeepCopy] = useState(true)
  const [notice, setNotice] = useState('')
  const started = season ? new Date(season.startedAt).toLocaleDateString() : ''

  function begin() {
    // The season just ended is saved first, as it stands, under its own name.
    if (keepCopy) download(saveProjectFile(project, opened, name), `${name}_project.json`, 'application/json')
    onChange(startSeason(project, newName, { clearFreeAgents }))
    onNameChange(newName)
    setNextName(null)
    setChosen('season')
    setNotice(`${newName} has begun. Changes from here on are listed above. Undo takes this back.`)
  }

  return (
    <main className="team help">
      <h2>Changes</h2>
      <p className="note">
        Everything you have changed, in plain words, kept up to date as you work. Use it to check your own work, or
        to tell the league what has been done. Logos and banners are not listed.
      </p>
      <p>
        <label className="choice">
          <input type="radio" name="since" checked={since === 'opened'} onChange={() => setChosen('opened')} /> Since this
          ROM was opened
        </label>
        <label className="choice">
          <input type="radio" name="since" checked={since === 'season'} disabled={!season} onChange={() => setChosen('season')} />{' '}
          {season ? `Since ${season.name} began, on ${started}` : 'Since the season began (start one below)'}
        </label>
      </p>
      {reportIsEmpty(report) ? (
        <p>Nothing has changed{since === 'season' ? ' since the season began' : ' since the ROM was opened'}.</p>
      ) : (
        <ReportView
          report={report}
          beforeName={since === 'season' && season ? `the start of ${season.name}` : 'the ROM as opened'}
          afterName={name}
          fileName={name}
        />
      )}

      <section>
        <h3>Start a new season</h3>
        <p className="note">
          Marks the teams as they stand now as the season's starting point. From then on this page can list what has
          changed since, however many times you close the editor or download the ROM in between. The starting point
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
              (season ? `This replaces the starting point of ${season.name}.` : 'The name at the top of the page changes to match. Your league rules carry over.')}
          </span>
        </p>
      </section>
    </main>
  )
}
