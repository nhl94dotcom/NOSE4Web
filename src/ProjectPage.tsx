import { useState } from 'react'
import { openProjectFile, saveProjectFile } from './core/projectfile'
import type { RomProject } from './core/rom'
import { download } from './download'

interface Props {
  project: RomProject
  // The ROM as it was opened, which a project file is laid over.
  opened: RomProject
  name: string
  onOpen: (project: RomProject, name: string) => void
}

export function ProjectPage({ project, opened, name, onOpen }: Props) {
  const [error, setError] = useState('')
  const [notes, setNotes] = useState<string[] | null>(null)

  async function open(file: File | undefined) {
    if (!file) return
    try {
      const result = openProjectFile(opened, await file.text())
      onOpen(result.project, result.name)
      setNotes(result.notes)
      setError('')
    } catch (e) {
      setNotes(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <main className="team help">
      <h2>Project file</h2>
      <p className="note">
        A project file holds all your work without the ROM: every team, the colours, the game settings, the pictures
        you replaced, and your free agents. Use it to move your work to another computer, to keep a copy of a season
        as it stood, or to pass your changes to someone who has the ROM themselves.
      </p>
      <section>
        <h3>Save</h3>
        <p>
          <button onClick={() => download(saveProjectFile(project, opened, name), `${name}_project.json`, 'application/json')}>
            Save project file
          </button>{' '}
          <span className="note">{name}_project.json</span>
        </p>
      </section>
      <section>
        <h3>Open</h3>
        <p>
          <label className="button">
            Open a project file…
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                void open(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        </p>
        <p className="note">
          The project is laid over the ROM as you opened it, so it replaces whatever you have done in the editor
          since. Undo brings that back. The ROM has to be the same kind the project was made with, though it need not
          be the very same file.
        </p>
        {error && <p className="error">{error}</p>}
        {notes && (
          <>
            <p>The project is open. Undo takes it back.</p>
            {notes.length > 0 && (
              <ul className="error">
                {notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      <section>
        <h3>How it differs from the other files</h3>
        <ul>
          <li>
            <b>A project file</b> is for you and the editor: everything, exactly, in one file that only the editor
            reads.
          </li>
          <li>
            <b>Spreadsheet files</b> are for editing in Excel. They hold the teams and settings, but not pictures or
            free agents.
          </li>
          <li>
            <b>A patch</b> turns one exact ROM into your edited ROM, for people who will play it, not edit it.
          </li>
        </ul>
      </section>
    </main>
  )
}
