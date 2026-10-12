// Reading and writing CSV text in the form spreadsheet programs expect.

export type Cell = string | number

function quote(cell: Cell): string {
  const text = String(cell)
  return /[",;\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text
}

// The leading mark tells Excel the file is UTF-8.
export function formatCsv(rows: Cell[][]): string {
  return '﻿' + rows.map((row) => row.map(quote).join(',')).join('\r\n') + '\r\n'
}

// Accepts commas or semicolons between cells, since Excel writes semicolons in
// some regional settings. Rows with nothing in them are dropped.
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, '')
  const firstLine = body.split(/\r?\n/, 1)[0]
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (quoted) {
      if (c !== '"') cell += c
      else if (body[i + 1] === '"') cell += body[++i]
      else quoted = false
    } else if (c === '"') {
      quoted = true
    } else if (c === delimiter) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += c
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ''))
}
