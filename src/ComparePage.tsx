import { useState } from 'react'
import { changeReport, reportIsEmpty, type ChangeReport } from './core/report'
import { openRom, type RomProject } from './core/rom'
import { ReportView } from './ReportView'

interface Result {
  fileName: string
  report: ChangeReport
}

interface Props {
  project: RomProject
  // What the ROM in the editor is called, for the report's title and file name.
  name: string
}

export function ComparePage({ project, name }: Props) {
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  async function compareWith(file: File | undefined) {
    if (!file) return
    try {
      const other = openRom(new Uint8Array(await file.arrayBuffer()))
      setResult({ fileName: file.name, report: changeReport(other, project) })
      setError('')
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <main className="team help">
      <h2>Compare ROMs</h2>
      <p className="note">
        Choose another ROM to see how the one in the editor differs from it, for example last season's ROM against
        this season's. The other ROM is only read; the editor keeps what it has. To see what you have changed since
        opening this ROM, or since the season began, use Changes in the list on the left.
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
          <ReportView report={result.report} beforeName={result.fileName.replace(/\.[^.]+$/, '')} afterName={name} fileName={name} />
        </>
      )}
    </main>
  )
}
