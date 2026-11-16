import { useMemo, useState } from 'react'
import { HackShortcuts } from './HackShortcuts'
import { hackSheetDiscord, hackSheetHtml } from './core/hacksheet'
import { applyNhl95Hacks, detectNhl95Hacks, NHL95_HACK_TITLES, NHL95_HACKS, nhl95HackSheet, nhl95HacksForDiscord, type Nhl95Hack, type Nhl95HackChoices } from './core/nhl95hacks'
import type { RomProject } from './core/rom'

interface Props {
  project: RomProject
  name: string
  onChange: (project: RomProject) => void
}

const SUMMARIES: Record<Nhl95Hack, string> = {
  passFix: 'Passes go the way the pad points, split into the eight directions as NHL 94 splits them.',
}

export function Nhl95HacksPage({ project, name, onChange }: Props) {
  const state = useMemo(() => detectNhl95Hacks(project.bytes), [project.bytes])
  // The choices being made, which start again from the ROM whenever it changes.
  const [draft, setDraft] = useState({ rom: project.bytes, choices: state.choices })
  if (draft.rom !== project.bytes) setDraft({ rom: project.bytes, choices: state.choices })
  const wanted: Nhl95HackChoices = draft.rom === project.bytes ? draft.choices : state.choices
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const changed = NHL95_HACKS.filter((hack) => wanted[hack] !== state.choices[hack])
  const unknown = (hack: Nhl95Hack) => state.unknown.includes(hack)

  function apply() {
    try {
      onChange(applyNhl95Hacks(project, wanted))
      setNotice(`Done: ${changed.length === 1 ? '1 change' : `${changed.length} changes`} to the game. Undo puts it back.`)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <main className="team help">
      <h2>Hacks</h2>
      <p className="notice">
        <b>How this page works:</b> choose the hacks you want, then press <b>Apply</b> at the bottom of the page.
        Nothing in the ROM changes until you do, and Undo takes it all back.
      </p>
      <p className="note">
        Changes to NHL '95 itself, from the NHL94 Match Viewer project's reading of the game's code. NHL 94's hacks
        were made for NHL 94's code and are not offered here. The page shows what this ROM has now. Test a hacked ROM in
        a game before a league plays on it.
      </p>
      <HackShortcuts
        onRecommended={null}
        discordText={() => nhl95HacksForDiscord(project.bytes, name)}
        discordMessages={() => hackSheetDiscord(nhl95HackSheet(project.bytes, name))}
        sheet={() => hackSheetHtml(nhl95HackSheet(project.bytes, name))}
        name={name}
      />
      <section id="hacks-play">
        <h3>How the game plays</h3>
        <div className="hack">
          <label>
            <b>{NHL95_HACK_TITLES.passFix}</b>{' '}
            <select
              aria-label={NHL95_HACK_TITLES.passFix}
              disabled={unknown('passFix')}
              value={wanted.passFix ? 'on' : 'off'}
              onChange={(e) => {
                setDraft({ rom: project.bytes, choices: { ...wanted, passFix: e.target.value === 'on' } })
                setNotice('')
                setError('')
              }}
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
          </label>
          <p className="summary">
            {SUMMARIES.passFix}
            {unknown('passFix') && (
              <b> This ROM's code here is neither the original game's nor this hack's, so it is left exactly as it is.</b>
            )}
          </p>
          <details className="more">
            <summary>More about it</summary>
            <p className="note">
              A pass goes the way the carrier faces when the pass button is let go, and the pad turns him. The routine
              that turns the pad's direction into one of the eight ways (vtoa, at $7C586) is NHL 94's with one
              instruction changed, which splits the eight ways differently from NHL 94. The fix puts NHL 94's
              instruction back (at $7C5B8). The game uses that routine in 35 other places as well, and they change the
              same way. An option, not a recommended fix: some leagues may prefer the game as
              it is.
            </p>
            <p className="note">
              Tested by Match Viewer in the game on the WN95HL's Season 18 ROM, at 31 moments played the same way on
              both ROMs: the B pass went the same way 26 times. Of the other 5, twice the carrier faced right with a
              teammate about 50 degrees off it, and the fix passed to him where the original passed straight across; three
              times he faced a diagonal with a teammate well behind, and the original passed back to him (54 to 108
              degrees off the way he faced) where the fix passed along the way he faced. The A pass, the soft pass, does
              not use the routine: 18 of 18 the same. In 8 of 26 moments where the pass was the same, a different player
              got the puck next, probably because the computer's skaters turned a little differently; that was not
              looked into further.
            </p>
          </details>
        </div>
      </section>
      <section id="hacks-apply" data-tab-always>
        <h3>Apply</h3>
        <p>
          <button disabled={changed.length === 0} onClick={apply}>
            Apply
          </button>{' '}
          <span className="note">{notice}</span>
        </p>
        {changed.length > 0 && (
          <div className="outcome">
            <p>Applying will make these changes to the game:</p>
            <ul>
              {changed.map((hack) => (
                <li key={hack}>
                  {NHL95_HACK_TITLES[hack]}: {state.choices[hack] ? 'on' : 'off'} to {wanted[hack] ? 'on' : 'off'}
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  )
}
