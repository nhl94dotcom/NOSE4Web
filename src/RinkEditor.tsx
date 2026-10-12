import { useState } from 'react'
import { hex } from './core/bytes'
import { PaletteEditor, Preview } from './Palette'

const VIEWS = [
  { template: 'rink-center', title: 'Centre ice' },
  { template: 'rink-top', title: 'Top of the rink' },
  { template: 'rink-bottom', title: 'Bottom of the rink' },
  { template: 'rink-pause', title: 'Pause menu' },
]

const ICE_LABELS = Array.from({ length: 16 }, (_, i) => `Rink colour ${hex(i, 1)}`)
const ARENA_LABELS = Array.from({ length: 16 }, (_, i) => `Arena colour ${hex(i, 1)}`)

interface Props {
  palette: number[]
  onChange: (palette: number[]) => void
}

export function RinkEditor({ palette, onChange }: Props) {
  const [view, setView] = useState(VIEWS[0].template)
  const ice = palette.slice(0, 16)
  const arena = palette.slice(16)

  return (
    <main className="team">
      <section>
        <h2>Rink colours</h2>
        <p className="note">These colours are shared by every team's home rink.</p>
        <p>
          <select value={view} onChange={(e) => setView(e.target.value)}>
            {VIEWS.map((v) => (
              <option key={v.template} value={v.template}>
                {v.title}
              </option>
            ))}
          </select>
        </p>
        <Preview template={view} palette={palette} scale={2} />
      </section>
      <section>
        <h2>Ice</h2>
        <PaletteEditor palette={ice} labels={ICE_LABELS} onChange={(next) => onChange([...next, ...arena])} />
      </section>
      <section>
        <h2>Arena</h2>
        <PaletteEditor palette={arena} labels={ARENA_LABELS} onChange={(next) => onChange([...ice, ...next])} />
      </section>
    </main>
  )
}
