import type { KeyboardEvent } from 'react'

// Moving around a table of boxes with the keyboard, as in a spreadsheet.
// Put on a table as its onKeyDown.
//
// Up and Down go to the same column of the row above or below, and Enter
// goes down. Left and Right go to the next box along the row: always from a
// list, and from a text box when the cursor is already at that end of it.
// Alt with an arrow is left alone, which is how a list is opened.

const BOXES = 'input:not([type=checkbox]):not([type=file]), select'

function boxIn(row: Element | null | undefined, column: number): HTMLElement | null {
  return row?.children[column]?.querySelector<HTMLElement>(BOXES) ?? null
}

function atEdge(target: HTMLElement, key: string): boolean {
  if (target instanceof HTMLSelectElement) return true
  if (!(target instanceof HTMLInputElement) || target.selectionStart === null) return false
  if (target.selectionStart !== target.selectionEnd) return false
  return key === 'ArrowLeft' ? target.selectionStart === 0 : target.selectionStart === target.value.length
}

export function gridKeyDown(event: KeyboardEvent<HTMLTableElement>): void {
  const target = event.target as HTMLElement
  if (event.altKey || event.ctrlKey || event.metaKey || !target.matches(BOXES)) return
  const cell = target.closest('td')
  const row = cell?.parentElement
  if (!cell || !row) return
  const column = Array.from(row.children).indexOf(cell)

  let next: HTMLElement | null = null
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Enter') {
    const step = event.key === 'ArrowUp' ? 'previousElementSibling' : 'nextElementSibling'
    // Rows that have no box in this column are passed over.
    for (let other = row[step]; other && !next; other = other[step]) next = boxIn(other, column)
    // Stay put at the top and bottom, and do not let the arrow change a list's choice.
    if (!next && event.key !== 'Enter') event.preventDefault()
  } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && atEdge(target, event.key)) {
    const step = event.key === 'ArrowLeft' ? -1 : 1
    for (let other = column + step; other >= 0 && other < row.children.length && !next; other += step) next = boxIn(row, other)
    if (!next && target instanceof HTMLSelectElement) event.preventDefault()
  }
  if (!next) return
  event.preventDefault()
  next.focus()
  if (next instanceof HTMLInputElement) next.select()
}

// Plus and minus, on the main keys or the number pad, step a list's value up
// or down. Returns +1 or -1, or 0 for any other key. The key beside minus
// counts as plus without Shift, as it does when zooming a page.
export function stepKey(event: KeyboardEvent<HTMLElement>): number {
  if (event.altKey || event.ctrlKey || event.metaKey) return 0
  if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') return 1
  if (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract') return -1
  return 0
}

// Typing a number into a list of stored values chooses that value, taking two
// digits typed quickly together as one number. Returns the value to set, or
// null if the key is not part of a number.
const TYPING_MS = 800
let typed = { box: null as EventTarget | null, text: '', at: 0 }

export function typedValue(event: KeyboardEvent<HTMLElement>, allowed: (value: number) => boolean): number | null {
  if (event.altKey || event.ctrlKey || event.metaKey || !/^[0-9]$/.test(event.key)) return null
  const now = Date.now()
  const joined = typed.box === event.target && now - typed.at < TYPING_MS ? typed.text + event.key : event.key
  const text = allowed(Number(joined)) ? joined : event.key
  typed = { box: event.target, text, at: now }
  return allowed(Number(text)) ? Number(text) : null
}
