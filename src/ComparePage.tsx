import { useState } from 'react'
import { compareProjects, type Difference } from './core/compare'
import { openRom, type RomProject } from './core/rom'

interface Result {
  fileName: string
  differences: Difference[]
}

interface Props {
  project: RomProject
}

export function ComparePage({ project }: Props) {
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  async function compareWith(file: File | undefined) {
    if (!file) return
    try {
      const other = openRom(new Uint8Array(await file.arrayBuffer()))
      setResult({ fileName: file.name, differences: compareProjects(other, project) })
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
        this season's. The other ROM is only read; the editor keeps what it has.
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
            {result.differences.length === 0 && ': none. The two are the same in everything the editor reads.'}
          </p>
          {result.differences.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              <ul>
                {section.changes.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </main>
  )
}
