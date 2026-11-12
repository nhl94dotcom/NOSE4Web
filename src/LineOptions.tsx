import { HAND_SIDES, type HandSide, type LineBuilderOptions } from './core/linebuilder'

// Where the builder puts each hand: the wingers and the defence pair.
export function LineOptionsPicker({ options, onChange }: { options: LineBuilderOptions; onChange: (next: LineBuilderOptions) => void }) {
  const picker = (key: keyof LineBuilderOptions, label: string) => (
    <label>
      {label}{' '}
      <select aria-label={`${label} for the line builder`} value={options[key]} onChange={(e) => onChange({ ...options, [key]: e.target.value as HandSide })}>
        {HAND_SIDES.map((side) => (
          <option key={side.value} value={side.value}>
            {side.label}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <>
      {picker('wings', 'Wingers')} {picker('defence', 'Defence')}
    </>
  )
}
