import { useState } from 'react'
import { formatCsv } from './core/csv'
import type { RomProject } from './core/rom'
import {
  CSV_TABLES,
  csvFileName,
  CsvImportError,
  importCsvSet,
  importWorkbookSheets,
  workbookSheets,
  type CsvTable,
  type SetImportResult,
} from './core/tables'
import { readWorkbook, writeWorkbook } from './core/workbook'
import { download } from './download'

const MAX_PROBLEMS_SHOWN = 20
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

interface Outcome {
  title: string
  summary: string
  details: string[]
  failed: boolean
}

interface Props {
  project: RomProject
  // The name of the workbook, and the start of every CSV file's name.
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

  async function exportWorkbook() {
    download(await writeWorkbook(workbookSheets(project)), `${setName}.xlsx`, XLSX_TYPE)
  }

  // Runs an import and reports what happened, whichever kind of file it was.
  async function runImport(title: string, read: () => Promise<Omit<SetImportResult, 'setName'> & { setName: string }>) {
    try {
      const result = await read()
      onChange(result.project)
      if (result.setName) onSetNameChange(result.setName)
      setOutcome({
        title,
        summary: result.setName ? `The name at the top of the page is now "${result.setName}".` : '',
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

  function importCsvFiles(chosen: File[]) {
    const title = `Imported ${chosen.length === 1 ? chosen[0].name : `${chosen.length} files`}`
    return runImport(title, async () => {
      const files = await Promise.all(chosen.map(async (file) => ({ name: file.name, text: await file.text() })))
      return importCsvSet(project, files)
    })
  }

  function importWorkbook(file: File) {
    return runImport(`Imported ${file.name}`, async () => {
      const sheets = await readWorkbook(new Uint8Array(await file.arrayBuffer()))
      return { ...importWorkbookSheets(project, sheets), setName: file.name.replace(/\.xlsx$/i, '') }
    })
  }

  function importButton(label: string, accept: string, multiple: boolean, onFiles: (files: File[]) => Promise<void>) {
    return (
      <label className="button">
        {label}
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) void onFiles(files)
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
          Everything in the editor, for every team, as tables you can edit in Excel or a similar program and import
          again. Use one Excel workbook or a set of CSV files; they hold the same tables. An import replaces what is
          in the editor now, and reaches the ROM when you download it.
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

        <h2>Excel workbook</h2>
        <p>
          <button onClick={() => void exportWorkbook()}>Export {setName}.xlsx</button>{' '}
          {importButton('Import a workbook…', '.xlsx', false, (files) => importWorkbook(files[0]))}
        </p>
        <p className="note">
          One file with a sheet for each table below, named {CSV_TABLES.map((table) => table.id).join(', ')}. Keep
          those sheet names. Sheets with other names, such as your own notes, are ignored.
        </p>

        <h2>CSV files</h2>
        <p>
          <button onClick={() => exportTables(CSV_TABLES)}>Export all {CSV_TABLES.length} files</button>{' '}
          {importButton('Import files…', '.csv,text/csv', true, importCsvFiles)}
        </p>
        <p className="note">
          Each file starts with the name at the top of the page. Choose any number of a set's files to import them
          together, in the right order. Your browser may ask permission to download several files at once.
        </p>

        <h2>The tables</h2>
        <table className="left">
          <tbody>
            {CSV_TABLES.map((table) => (
              <tr key={table.id}>
                <td>
                  <strong>{table.title}</strong>
                  <div className="note">{csvFileName(setName, table)}</div>
                </td>
                <td>
                  <button onClick={() => exportTables([table])}>Export CSV</button>
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
