import { resetSettingsPart, settingsPartChanged } from './core/reset'
import {
  SCOUTING_STAND_NOTES,
  SCOUTING_WIDTH,
  scoutingLineProblem,
  scoutingOrder,
  scoutingPreview,
  scoutingStands,
  scoutingUsed,
} from './core/scouting'
import type { Settings } from './core/settings'
import { ResetButton } from './ResetButton'

interface Props {
  settings: Settings
  original: Settings
  onChange: (settings: Settings) => void
}

// What Ron Barr says on the pregame matchup screen: each line of his script,
// what the game shows it for, the stand-ins it fills in, and a preview.
export function ScoutingSection({ settings, original, onChange }: Props) {
  const scouting = settings.scouting
  if (!scouting) return null
  const { platform } = scouting
  const snes = platform === 'snes'
  const used = scoutingUsed(scouting)
  const fits = used !== null && used <= scouting.room
  const preview = scoutingPreview(scouting)
  const notes = SCOUTING_STAND_NOTES[platform]
  const setLine = (i: number, text: string) =>
    onChange({ ...settings, scouting: { ...scouting, lines: scouting.lines.map((line, j) => (j === i ? { ...line, text: text.replace(/[\r\n]+/g, ' ') } : line)) } })
  return (
    <section id="scouting">
      <h2>Ron Barr's matchup screen text</h2>
      <p>
        <ResetButton what="text" changed={settingsPartChanged(settings, original, 'scouting')} onReset={() => onChange(resetSettingsPart(settings, original, 'scouting'))} />{' '}
        <span className={fits ? 'note' : 'error'}>
          {used ?? '?'} of {scouting.room} letters used.
          {used === null ? ' A line has a problem: the text is not written until it is put right.' : fits ? '' : ' Too long: the text is not written until it fits.'}
        </span>
      </p>
      <p className="note">
        What the announcer says in the text box before each game, typed out a word at a time. The game picks its lines by number, so the lines stay as
        many as they are: change what each says, or leave one empty. Words in braces are stand-ins the game fills in, as{' '}
        <code>{'{home city}'}</code>; type them as listed below. The box is {SCOUTING_WIDTH[platform]} letters wide and wraps between words.
        {snes
          ? ' The room counts the team places stored before the script, which the game never shows: they are emptied if the lines need their room.'
          : ' The line the original game never shows is room too: empty it to make others longer.'}
      </p>
      {scouting.lines.some((line) => line.role === null) && (
        <p className="note">This ROM chooses its lines with code of its own, so which line shows when is not known here: they are listed in order.</p>
      )}
      <ol className="scouting">
        {scoutingOrder(scouting).map((i) => {
          const line = scouting.lines[i]
          const problem = scoutingLineProblem(platform, line.text)
          return (
            <li key={i} value={i + 1}>
              <label>
                <span className="note">{line.role ?? `Line ${i + 1}`}</span>
                <br />
                <textarea
                  aria-label={line.role ?? `Line ${i + 1}`}
                  className={problem || (line.blank && line.text.trim()) ? 'shared' : undefined}
                  rows={Math.max(2, Math.ceil(line.text.length / 60) + 1)}
                  cols={60}
                  value={line.text}
                  onChange={(e) => setLine(i, e.target.value)}
                />
              </label>
              {problem && <span className="error"> {problem}</span>}
              {line.blank && line.text.trim() && <span className="note"> This line shows between every paragraph.</span>}
            </li>
          )
        })}
      </ol>
      <details>
        <summary>Stand-ins</summary>
        <ul>
          {scoutingStands(platform).map((stand) => (
            <li key={stand.label}>
              <code>{`{${stand.label}}`}</code>
              {notes[stand.label] && <span className="note"> {notes[stand.label]}</span>}
            </li>
          ))}
        </ul>
        <p className="note">
          A line can't start with a stand-in in the game, so NOSE4Web puts a space before one there.
          {snes ? '' : ' The characters the game uses for stand-ins ( _ + $ [ ] < > | \\ @ # % = * ^ ; ) can only be stand-ins.'}
        </p>
      </details>
      {preview && (
        <details>
          <summary>Preview, with example names</summary>
          <pre className="scouting-preview">{preview.join('\n')}</pre>
          <p className="note">
            Roughly as the box wraps it: Montreal at home to Boston. The game leaves out the hotter team line when the teams have been playing about
            as well as each other, and the visitors' hot and cold players when a team plays itself.
          </p>
        </details>
      )}
    </section>
  )
}
