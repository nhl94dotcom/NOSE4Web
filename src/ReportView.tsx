import { useState } from 'react'
import { writeClipboard } from './clipboard'
import { arrivalText, departureText, reportIsEmpty, reportText, type ChangeReport } from './core/report'
import { download } from './download'

interface Props {
  report: ChangeReport
  // What the two sides are called, for the report's title.
  beforeName: string
  afterName: string
  // Starts the name of the downloaded file.
  fileName: string
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)
// Long lists start folded so the page stays readable.
const OPEN_UP_TO = 40

// A change report on the page: a summary for the league, then everything
// team by team, with buttons to take it away as text.
export function ReportView({ report, beforeName, afterName, fileName }: Props) {
  const [notice, setNotice] = useState('')
  if (reportIsEmpty(report)) return null
  const text = () => reportText(report, beforeName, afterName)
  const list = (title: string, rows: string[]) =>
    rows.length > 0 && (
      <details open={rows.length <= OPEN_UP_TO}>
        <summary>
          {title} ({rows.length})
        </summary>
        <ul>
          {rows.map((row, i) => (
            <li key={i}>{row}</li>
          ))}
        </ul>
      </details>
    )
  const moved = report.moves.length + report.arrivals.length + report.departures.length + report.reratings.length

  return (
    <>
      <p>
        <button onClick={() => download(text(), `${fileName}_changes.txt`, 'text/plain')}>Download report</button>{' '}
        <button
          onClick={() => {
            void writeClipboard(text())
            setNotice('Copied. Paste it into a message or a post.')
          }}
        >
          Copy report
        </button>{' '}
        <span className="note">{notice || 'The report is plain text holding everything below.'}</span>
      </p>
      <section>
        <h3>For the league</h3>
        <p className="note">Players are matched by name across all teams.</p>
        {list('Changed teams', report.moves.map((m) => `${m.name}: ${m.from} to ${m.to} (overall ${m.overall})`))}
        {list('New players', report.arrivals.map(arrivalText))}
        {list('No longer on a team', report.departures.map(departureText))}
        {list(
          'Overall ratings, biggest change first',
          report.reratings.map((r) => `${r.name} (${r.team}): ${r.from} to ${r.to} (${signed(r.to - r.from)})`),
        )}
        {moved === 0 && <p>No player moved, arrived, left or changed overall rating.</p>}
      </section>
      <h3>Everything, team by team</h3>
      {report.details.map((section) => (
        <section key={section.heading}>
          <h3>{section.heading}</h3>
          <ul>
            {section.changes.map((change, i) => (
              <li key={i}>{change}</li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
