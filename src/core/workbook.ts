import type { Cell } from './csv'

// Reading and writing Excel (.xlsx) files. The spreadsheet library is large,
// so it is loaded only when one of these is first used.

export interface WorkbookSheet<T> {
  name: string
  rows: T[][]
}

export async function writeWorkbook(sheets: WorkbookSheet<Cell>[]): Promise<Uint8Array> {
  const XLSX = await import('xlsx')
  const book = XLSX.utils.book_new()
  for (const sheet of sheets) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name)
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
}

// Every cell comes back as text, the way it would from a CSV file.
export async function readWorkbook(file: Uint8Array): Promise<WorkbookSheet<string>[]> {
  const XLSX = await import('xlsx')
  const book = XLSX.read(file, { type: 'array' })
  return book.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, raw: true, defval: '' })
    return { name, rows: rows.map((row) => row.map((cell) => String(cell ?? ''))) }
  })
}
