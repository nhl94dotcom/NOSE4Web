import { useState } from 'react'
import { formatCsv } from './core/csv'
import type { RomProject } from './core/rom'
import { CSV_TABLES, csvFileName, CsvImportError, importCsvSet, type CsvTable } from './core/tables'
import { download } from './download'

const MAX_PROBLEMS_SHOWN = 20

interface Outcome {
  title: string
  summary: string
  details: string[]
  failed: boolean
}

interface Props {
  project: RomProject
  // The name at the start of every file in the set.
  setName: string
  onChange: (project: RomProject) => void
  onSetNameChange: (setName: string) => void
}

export function CsvPanel({ project, setName, onChange, onSetNameChange }: Props) {
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  function exportTables(tables: CsvTable[]) {
    // Browsers drop downloads that start at the same instant, so they are spaced out.
    tables.forEach((table, i) => {
      setTimeout(() => download(formatCsv(table.rows(project)), csvFileName(setName, table), 'text/csv'), i * 250)
    })
  }

  async function importFiles(chosen: FileList | null) {
    if (!chosen || chosen.length === 0) return
    const names = Array.from(chosen, (file) => file.name)
    try {
      const files = await Promise.all(Array.from(chosen, async (file) => ({ name: file.name, text: await file.text() })))
      const result = importCsvSet(project, files)
      onChange(result.project)
      if (result.setName) onSetNameChange(result.setName)
      setOutcome({
        title: `Imported ${result.files.length === 1 ? names[0] : `${result.files.length} files`}`,
        summary: result.setName ? `The set name is now "${result.setName}".` : '',
        details: result.files.flatMap((file) => [`${file.table.title}: ${file.summary}`, ...file.warnings]),
        failed: false,
      })
    } catch (e) {
      const problems = e instanceof CsvImportError ? e.problems : [e instanceof Error ? e.message : String(e)]
      const details = problems.slice(0, MAX_PROBLEMS_SHOWN)
      if (problems.length > details.length) details.push(`…and ${problems.length - details.length} more.`)
      setOutcome({
        title: 'Nothing was imported',
        summary: 'No changes were made. Fix these and import again:',
        details,
        failed: true,
      })
    }
  }

  function importButton(label: string, multiple: boolean) {
    return (
      <label className="button">
        {label}
        <input
          type="file"
          accept=".csv,text/csv"
          multiple={multiple}
          hidden
          onChange={(e) => {
            void importFiles(e.target.files)
            e.target.value = '' // so the same file can be chosen again
          }}
        />
      </label>
    )
  }

  return (
    <main className="team">
      <section>
        <h2>Spreadsheet files</h2>
        <p className="note">
          The whole ROM as a set of CSV files for Excel or a similar program. Every file covers all teams and starts
          with the name at the top of the page, for example {csvFileName(setName, CSV_TABLES[1])}.
        </p>
        <p>
          <button onClick={() => exportTables(CSV_TABLES)}>Export all {CSV_TABLES.length} files</button>{' '}
          {importButton('Import files…', true)}
        </p>
        <p className="note">
          Choose any number of a set's files to import them together, in the right order. An import replaces what is
          in the editor now, and reaches the ROM when you download it. Your browser may ask permission to download
          several files at once.
        </p>
        {outcome && (
          <div className={outcome.failed ? 'outcome error' : 'outcome'}>
            <strong>{outcome.title}</strong>
            {outcome.summary && <p>{outcome.summary}</p>}
            <ul>
              {outcome.details.map((detail, i) => (
                <li key={i}>{detail}</li>
              ))}
            </ul>
          </div>
        )}
        <table className="left">
          <tbody>
            {CSV_TABLES.map((table) => (
              <tr key={table.id}>
                <td>
                  <strong>{table.title}</strong>
                  <div className="note">{csvFileName(setName, table)}</div>
                </td>
                <td>
                  <button onClick={() => exportTables([table])}>Export</button>
                </td>
                <td className="wrap note">{table.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
