import { useState } from 'react'
import { importPictureSet, pictureKinds, pictureSet, pictureTitle, type PictureSetResult } from './core/pictureset'
import type { RomProject } from './core/rom'
import { createZip, isZip, readZip } from './core/zip'
import { download } from './download'
import { pictureToPng, readImage } from './images'

interface Props {
  project: RomProject
  // Starts the name of the zip file, as it does the spreadsheet files.
  setName: string
  onChange: (project: RomProject) => void
}

const SHOWN = 60
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

export function PicturesPage({ project, setName, onChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PictureSetResult | null>(null)
  const kinds = pictureKinds(project)
  const set = pictureSet(project)

  async function exportAll() {
    setBusy(true)
    setError('')
    try {
      const files = []
      for (const entry of set) files.push({ name: entry.name, data: await pictureToPng(entry.picture, entry.palette) })
      download(createZip(files), `${setName}_pictures.zip`, 'application/zip')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  async function importFiles(chosen: File[]) {
    if (chosen.length === 0) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      // Zip files are opened up; anything else is taken as a picture itself.
      const files: { name: string; data: Uint8Array }[] = []
      for (const file of chosen) {
        const data = new Uint8Array(await file.arrayBuffer())
        if (isZip(data)) files.push(...(await readZip(data)))
        else files.push({ name: file.name, data })
      }
      const images = []
      const unreadable: string[] = []
      for (const file of files) {
        // Zips made on a Mac carry hidden files beside the real ones.
        if (/(^|\/)(__MACOSX\/|\._|\.DS_Store$|Thumbs\.db$)/.test(file.name)) continue
        if (!/\.png$/i.test(file.name)) {
          unreadable.push(`${file.name}: not a PNG file, so it was left out.`)
          continue
        }
        try {
          images.push({ name: file.name, ...(await readImage(new Blob([file.data.slice().buffer], { type: 'image/png' }))) })
        } catch {
          unreadable.push(`${file.name}: could not be read as an image.`)
        }
      }
      const imported = importPictureSet(project, images)
      if (imported.replaced.length > 0) onChange(imported.project)
      setResult({ ...imported, problems: [...unreadable, ...imported.problems] })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  return (
    <main className="team help">
      <h2>Picture files</h2>
      <p className="note">
        Every team's logos and banners as PNG files in one zip, the way the spreadsheet files hold everything else.
        Use it to carry artwork to next season's ROM, to edit many pictures in one sitting, or to keep a copy.
      </p>
      <section>
        <h3>Export</h3>
        <p>
          <button disabled={busy} onClick={() => void exportAll()}>
            Export all pictures
          </button>{' '}
          <span className="note">
            {count(set.length, 'picture')} in {setName}_pictures.zip:{' '}
            {kinds.map((kind) => pictureTitle(project, kind).toLowerCase()).join(', ')} for each team. One that
            several teams share is in it once.
          </span>
        </p>
      </section>
      <section>
        <h3>Import</h3>
        <p>
          <label className="button">
            Import pictures…
            <input
              type="file"
              accept=".zip,.png,image/png,application/zip"
              multiple
              hidden
              disabled={busy}
              onChange={(e) => {
                // Copied first: clearing the box, so the same files can be chosen again, empties its list.
                void importFiles(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
          </label>{' '}
          <span className="note">Choose a zip, or any number of PNG files.</span>
        </p>
        <p className="note">
          A file is matched to its team and picture by its name, such as 03_Buffalo_Sabres_menu_logo.png: the number at
          the start is the team's place in the list, and the end says which picture. The team name in the middle is
          only for you. Files showing what the editor has already are skipped, so only pictures you changed are
          replaced. Each must be the same size as the picture it replaces.
        </p>
        {busy && <p>Working…</p>}
        {error && <p className="error">{error}</p>}
        {result && (
          <>
            <p>
              Replaced {count(result.replaced.length, 'picture')}. {count(result.unchanged, 'file')} matched what was
              there already.
              {result.problems.length > 0 && ` ${count(result.problems.length, 'file')} could not be used.`}
              {result.replaced.length > 0 && ' Undo takes the import back.'}
            </p>
            {result.problems.length > 0 && (
              <ul className="error">
                {result.problems.slice(0, SHOWN).map((problem, i) => (
                  <li key={i}>{problem}</li>
                ))}
                {result.problems.length > SHOWN && <li>…and {result.problems.length - SHOWN} more.</li>}
              </ul>
            )}
            {result.replaced.length > 0 && (
              <details open={result.replaced.length <= SHOWN}>
                <summary>Replaced ({result.replaced.length})</summary>
                <ul>
                  {result.replaced.map((title, i) => (
                    <li key={i}>{title}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>
    </main>
  )
}
