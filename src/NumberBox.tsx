import { useState } from 'react'

interface NumberBoxProps {
  label: string
  value: number
  range: [number, number]
  // How many of the game's units make one of what is typed.
  perUnit: number
  // Anything whose changing means the box should show the value afresh.
  fresh: unknown
  disabled: boolean
  onChange: (value: number) => void
}

// A box for one of the game's numbers. What is typed is kept as typed, and
// passed on whenever it is a number the game can take.
export function NumberBox({ label, value, range, perUnit, fresh, disabled, onChange }: NumberBoxProps) {
  const shown = (stored: number) => String(perUnit === 1 ? stored : Number((stored / perUnit).toFixed(2)))
  const [typed, setTyped] = useState({ value, fresh, text: shown(value) })
  if (typed.value !== value || typed.fresh !== fresh) setTyped({ value, fresh, text: shown(value) })
  const read = (text: string) => {
    const stored = Math.round(Number(text) * perUnit)
    return text.trim() !== '' && Number.isFinite(stored) && stored >= range[0] && stored <= range[1] ? stored : null
  }
  return (
    <input
      className="num"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={read(typed.text) === null}
      disabled={disabled}
      value={typed.text}
      onChange={(e) => {
        const stored = read(e.target.value)
        setTyped({ value: stored ?? value, fresh, text: e.target.value })
        if (stored !== null && stored !== value) onChange(stored)
      }}
    />
  )
}
