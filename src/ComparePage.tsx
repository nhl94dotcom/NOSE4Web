import { useState } from 'react'
import { writeClipboard } from './clipboard'
import { changeReport, reportIsEmpty, reportText, type Arrival, type ChangeReport } from './core/report'
import { openRom, type RomProject } from './core/rom'
import { download } from './download'

interface Result {
  fileName: string
  report: ChangeReport
}

interface Props {
  project: RomProject
  // What the ROM in the editor is called, for the report's title and file name.
  name: string
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)
// Long lists start folded so the page stays readable.
const OPEN_UP_TO = 40

export function ComparePage({ project, name }: Props) {
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function compareWith(file: File | undefined) {
    if (!file) return
    try {
      const other = openRom(new Uint8Array(await file.arrayBuffer()))
      setResult({ fileName: file.name, report: changeReport(other, project) })
      setError('')
      setNotice('')
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const text = () => (result ? reportText(result.report, result.fileName.replace(/\.[^.]+$/, ''), name) : '')
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
  const arrival = (a: Arrival) => `${a.name}: ${a.team}, ${a.role}, overall ${a.overall}`

  return (
    <main className="team help">
      <h2>Compare ROMs</h2>
      <p className="note">
        Choose another ROM to see how the one in the editor differs from it, for example last season's ROM against
        this season's. The other ROM is only read; the editor keeps what it has.
      </p>
      <p>
        <label className="button">
          Compare with a ROM…
          <input
            type="file"
            accept=".bin,.smd,.md,.gen"
            hidden
            onChange={(e) => {
              void compareWith(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </p>
      {error && <p className="error">{error}</p>}
      {result && (
        <>
          <p>
            Changes going from <b>{result.fileName}</b> to what is in the editor
            {reportIsEmpty(result.report) && ': none. The two are the same in everything the editor reads.'}
          </p>
          {!reportIsEmpty(result.report) && (
            <>
              <p>
                <button onClick={() => download(text(), `${name || 'rom'}_changes.txt`, 'text/plain')}>Download report</button>{' '}
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
                {list('Changed teams', result.report.moves.map((m) => `${m.name}: ${m.from} to ${m.to} (overall ${m.overall})`))}
                {list('New players', result.report.arrivals.map(arrival))}
                {list('No longer in the ROM', result.report.departures.map(arrival))}
                {list(
                  'Overall ratings, biggest change first',
                  result.report.reratings.map((r) => `${r.name} (${r.team}): ${r.from} to ${r.to} (${signed(r.to - r.from)})`),
                )}
                {result.report.moves.length + result.report.arrivals.length + result.report.departures.length + result.report.reratings.length === 0 && (
                  <p>No player moved, arrived, left or changed overall rating.</p>
                )}
              </section>
              <h3>Everything, team by team</h3>
            </>
          )}
          {result.report.details.map((section) => (
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
      )}
    </main>
  )
}
