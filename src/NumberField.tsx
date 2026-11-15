import { useEffect, useRef, useState } from 'react'
import { stepKey } from './gridKeys'

interface Props {
  value: number
  min: number
  max: number
  onValue: (value: number) => void
  // How the number is shown, and read back from what is typed (null when it is not one); decimal by default.
  format?: (value: number) => string
  parse?: (text: string) => number | null
  className?: string
  title?: string
  maxLength?: number
  disabled?: boolean
  // Whether the up and down arrows step it: not in a table where they move between rows (gridKeyDown).
  arrows?: boolean
  'aria-label'?: string
}

const decimal = (text: string) => (/^\s*-?\d+\s*$/.test(text) ? Number(text) : null)

// A box for a whole number. While it has the focus what is typed stays as typed (it can be emptied and typed
// afresh), and is passed on whenever it is a number in range; clicking in selects it all, so typing replaces it;
// plus and minus step it, as they do the ratings, and the up and down arrows too outside the roster tables. Leaving the box shows the number as it is again. A text box rather than
// type="number", whose spinner and mouse wheel change it by accident.
export function NumberField({ value, min, max, onValue, format = String, parse = decimal, className = 'num', title, maxLength, disabled, arrows = true, ...rest }: Props) {
  const [text, setText] = useState<string | null>(null)
  // What the box holds this moment, for keys pressed faster than it is drawn again.
  const latest = useRef<string | null>(null)
  const read = (typed: string) => {
    const n = parse(typed)
    return n !== null && Number.isInteger(n) && n >= min && n <= max ? n : null
  }
  // The number last passed on. Where the page keeps another (Forwards, at most the team's skaters), the box shows the
  // number kept, and steps from it.
  const sent = useRef<number | null>(null)
  useEffect(() => {
    if (sent.current === null || value === sent.current) return
    sent.current = null
    latest.current = format(value)
    setText((typed) => (typed === null ? null : format(value)))
  }, [value, text, format])
  const shown = text ?? format(value)
  const set = (typed: string) => {
    latest.current = typed
    setText(typed)
    const n = read(typed)
    if (n !== null && n !== value) {
      sent.current = n
      onValue(n)
    }
  }
  return (
    <input
      className={className}
      title={title}
      inputMode="numeric"
      maxLength={maxLength}
      disabled={disabled}
      aria-label={rest['aria-label']}
      aria-invalid={text !== null && read(text) === null}
      value={shown}
      onFocus={(e) => {
        latest.current = format(value)
        setText(format(value))
        e.target.select()
      }}
      onBlur={() => {
        latest.current = null
        sent.current = null
        setText(null)
      }}
      onChange={(e) => set(e.target.value)}
      onKeyDown={(e) => {
        const arrow = arrows && !e.altKey ? (e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0) : 0
        const step = arrow || stepKey(e)
        if (step === 0) return
        e.preventDefault()
        const next = Math.min(max, Math.max(min, (read(latest.current ?? shown) ?? value) + step))
        set(format(next))
      }}
    />
  )
}
