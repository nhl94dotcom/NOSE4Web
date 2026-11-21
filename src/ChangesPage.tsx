import { useMemo, useState } from 'react'
import { reportIsEmpty } from './core/report'
import type { RomProject } from './core/rom'
import { changesSince } from './core/season'
import { ReportView } from './ReportView'

interface Props {
  project: RomProject
  // The ROM as it was opened.
  opened: RomProject
  name: string
  // Opens the New season page.
  onGoToNewSeason: () => void
}

type Since = 'opened' | 'season'

export function ChangesPage({ project, opened, name, onGoToNewSeason }: Props) {
  const season = project.baseline
  // Since the season began, where one has; otherwise since the ROM was opened.
  const [chosen, setChosen] = useState<Since>('season')
  const since: Since = season && chosen === 'season' ? 'season' : 'opened'
  const report = useMemo(() => changesSince(project, since === 'season' && season ? season : opened), [project, opened, season, since])

  const started = season ? new Date(season.startedAt).toLocaleDateString() : ''

  return (
    <main className="team help">
      <h2>Changes</h2>
      <p className="note">
        Everything you have changed, in plain words, kept up to date as you work. Use it to check your own work, or
        to tell the league what has been done. Logos and banners are listed since the ROM was opened, but not since the season began.
      </p>
      <p>
        <label className="choice">
          <input type="radio" name="since" checked={since === 'opened'} onChange={() => setChosen('opened')} /> Since this
          ROM was opened
        </label>
        <label className="choice">
          <input type="radio" name="since" checked={since === 'season'} disabled={!season} onChange={() => setChosen('season')} />{' '}
          {season ? `Since ${season.name} began, on ${started}` : 'Since the season began (start one on the New season page)'}
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
      <p className="note">
        Start a new season is on the New season page. <button onClick={onGoToNewSeason}>Go to New season</button>
      </p>
    </main>
  )
}
