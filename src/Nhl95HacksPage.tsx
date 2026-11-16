import { useMemo, useState, type ReactNode } from 'react'
import { HackShortcuts } from './HackShortcuts'
import { hackSheetDiscord, hackSheetHtml } from './core/hacksheet'
import {
  applyNhl95Hacks,
  detectNhl95Hacks,
  NHL95_HACK_SECTIONS,
  NHL95_HACK_TITLES,
  NHL95_HACKS,
  nhl95HackSheet,
  nhl95HacksForDiscord,
  type Nhl95Hack,
  type Nhl95HackChoices,
} from './core/nhl95hacks'
import type { RomProject } from './core/rom'

interface Props {
  project: RomProject
  name: string
  onChange: (project: RomProject) => void
}

const SUMMARIES: Record<Nhl95Hack, string> = {
  secondAssist: 'When two players pass back and forth before a goal, the second assist is credited.',
  oneTimerAssist: "A one-timer goal keeps its assists when the shooter's stick touched the pass before he shot.",
  regainAssist: 'A player who wins the puck back himself and passes to the scorer gets his assist.',
  aggressionFix: 'Aggression works as the rating reads, where the original wraps it round (a 4 plays like a 1).',
  comebackFix: 'A team tied or behind in the third period gets its boost in the second half of it, not the first.',
  openNetFix: 'A one-timer at an open net is aimed at the middle of the net, not just under the crossbar.',
  blindRingFix: "A loose puck near the goalie's stick but off its blade meets the goalie, where the original lets it through.",
  seasonOvertime: 'A tied regular-season game plays overtime after overtime until a goal, as the playoffs do.',
  rocketFix: 'Passes go at their own speed: no more rocket passes, sent much faster because the game rounds their time down.',
  passFix: "Passes go to the teammate you're pointing at, as in NHL 94, instead of sometimes straight across or back behind the passer.",
}

// NHL 94's fixes, tested in NHL '95 too.
const TESTED =
  "NHL '95's code here is NHL 94's instruction for instruction (from the NHL95Genesis disassembly), so it has the same bug, and NHL 94's fix goes in unchanged at NHL '95's addresses, also in the WN95HL's ROMs. Tested in the game by the NHL94 Match Viewer project on the original game and the WN95HL's Season 18 ROM."
// The assist fixes, with what was tested.
const ASSISTS_TESTED =
  "NHL '95's code here is NHL 94's instruction for instruction (from the NHL95Genesis disassembly), so it has the same bug, and NHL 94's fix goes in unchanged at NHL '95's addresses, also in the WN95HL's ROMs. Tested in the game by the NHL94 Match Viewer project on the original game and the WN95HL's Season 18 ROM, with the game's own code doing every pickup, pass and shot: a player who wins the puck back and passes to the scorer gets the assist, a give-and-go credits both passers, and a one-timer whose shooter's stick touched the pass keeps its two assists, where the original gives none; a plain one-timer and a teammate's regained puck are as before."

const MORE: Record<Nhl95Hack, ReactNode> = {
  secondAssist: (
    <>
      <p className="note">
        The game keeps a list of the last three players of a team to touch the puck: the scorer and his two assists.
        When two players pass back and forth, the list moves down at each touch, so the earlier passer drops off and
        the goal has only one assist. The fix moves the list down only when the new toucher is not the first assist
        already. {ASSISTS_TESTED}
      </p>
    </>
  ),
  oneTimerAssist: (
    <p className="note">
      A one-timer puts the shooter on the list by its own three moves, without the checks a touch makes, so where his
      stick touched the pass before he shot the list reads shooter, shooter, passer, and the goal has no assist. The
      fix uses a touch's own update there. In NHL 94 it happened in 3 of 71 one-timer goals in recorded games.{' '}
      {ASSISTS_TESTED}
    </p>
  ),
  regainAssist: (
    <p className="note">
      When the other team takes the puck, the game marks the list so the next touch replaces the last toucher. A
      player who wins the puck straight back skips the step that clears the mark, so the teammate he passes to
      replaces him and his assist is lost. In NHL 94 it happened in 8 of 274 recorded goals. {ASSISTS_TESTED}
    </p>
  ),
  aggressionFix: (
    <p className="note">
      In play a rating counts five times its value, give or take a little for being hot or cold, so 0 to 30. Aggression
      is then cut to 0 to 15 by keeping only its last four bits, so it wraps round: a 4 plays like a 1, and a 6 or a 3 is
      the most penalised. The fix keeps it in bounds with the game's own clamp and halves it, so it runs from 0 to 15 with
      the rating. On the original, ratings 16 to 23 played as 0 to 7 (a 22 like a 6). For goalies the same place holds
      the glove rating, but NHL '95 has no reaching glove save (its test branches to the next instruction), so goalies
      play as before. {TESTED}
    </p>
  ),
  comebackFix: (
    <p className="note">
      A team tied or behind in the third period is meant to get a small boost late on, but the test of the clock is the
      wrong way round, so the boost comes while more than half the period is left and goes for the rest. Overtime is not
      affected: both teams have it throughout. {TESTED}
    </p>
  ),
  openNetFix: (
    <p className="note">
      The game aims a one-timer itself, and computer shooters the same way. Where the sightline from the puck through the
      goalie misses the net, the goalie having wandered out of the puck's line, it aims high in the middle, just under the
      crossbar, and the scatter only goes up, so close in about 4 in 10 sail over or hit the bar. The fix aims there as
      it does with no goalie at all, at the middle at mid-height; the penalty shot and shootout aim still follow. In NHL
      94, open-net one-timer goals went from 56% to 86% with it; in Match Viewer's NHL '95 test, 10 of 16 against 15 of
      16. An option, not a recommended fix. {TESTED}
    </p>
  ),
  blindRingFix: (
    <p className="note">
      When a low loose puck comes within a goalie's stick box, the game hands it to his stick and skips the test of his
      body; but his stick takes a loose puck only within 8 units of its blade. So a puck between the two touches nothing
      and slides on, which is how some five-hole goals go in. In NHL 94 the gap was a ring from 8 to 14 units; NHL '95's
      box is a square of 14 each way, and a mistake in its distance test (it compares with an address, not a value)
      makes the whole square count, so its gap runs from 8 units to about 20 at the corners (the NHL94 Match Viewer
      project, from the code). NHL 94's fix, Match Viewer's, sends that case on to the goalie's body test, which saves or
      holds it by his ratings; everything else is as before. In NHL 94 it changed expected goals by about -0.3% over
      928 recorded shots, and 3 of 218 recorded goals were five-hole goals. An option, not a recommended fix. Also in the
      WN95HL's ROMs. Tested in the game by Match Viewer on the original game and the WN95HL's Season 18 ROM, a slow low
      puck placed at every point of a grid round the goalie in 33 of his frames (37 on the WN95HL's): the points inside
      his reach that nothing touched fell from 2,933 to 549 (3,503 to 647), the channel through his middle in the
      stick saves closed, a standing goalie's gap all but gone; every point that played before plays the same. What is
      left is at the edge of his reach, where his body test never reached.
    </p>
  ),
  seasonOvertime: (
    <p className="note">
      In the original game a regular-season game still tied after one overtime ends in a tie, while a playoff game
      (exhibition playoffs, or a season's playoffs) plays another overtime, and another, until a goal. With this on the
      regular season plays on the same way, each overtime 10 minutes, as NHL '95's regular-season overtime always is.
      NHL 94's option, made from the same two places in NHL '95's code (from the NHL95Genesis disassembly), also in the
      WN95HL's ROMs. Not yet tested in an NHL '95 game.
    </p>
  ),
  rocketFix: (
    <p className="note">
      The game aims a pass at where its receiver will be: it works out when the two meet, in whole eighths of a second,
      and sets the puck's speed to cover the distance in that time. It rounds the time down, so a meeting due in 1.9
      eighths is made in 1, nearly twice as fast, and a time just below 0 is taken as an eighth. In NHL 94's recorded
      games 345 of 2,535 passes went over 1.3 times their speed and 69 over 27,000. NHL '95 (passtoa0, $847BA) works the
      time out the same way, and NHL 94's fix, the NHL94 Match Viewer project's, goes in: it works in 64ths of a second.
      NHL '95's own step after it is kept: its slow flat pass ($BF08 bit 1) still takes four times as long, and is flat
      when its lift reaches the cap, as in the original. Also in the WN95HL's ROMs. Tested in the game by Match Viewer on
      the original game and the WN95HL's Season 18 ROM, 144 targeted passes on each: the original's middle pass went
      1.09 times its speed, with 18 and 23 over 1.3 times; with the fix 0.99 and 1.01, none over 1.3 times, the middle
      80% within 0.96 to 1.03. Lift and receptions as before or a little better. The receiver's wait is kept in a
      signed byte, so a wait over 127 frames counts as over at once and he goes back to his own play. The slow pass,
      four times as long, reached that with the exact time from about half a second, and fewer slow passes were caught
      (64 against the original's 75 on the original game). Capping the wait at 127 helped there (100) but cost the
      WN95HL's ROM (77 against 91), its receivers standing still up to 2.1 seconds and leaving before a slow puck came.
      So now the wait is the original's wherever the original's is over 127, the receiver giving up there as he
      always has, and otherwise the exact one, at most 127. That last change is still to be played.
    </p>
  ),
  passFix: (
    <>
      <p className="note">
        When you pass, the game looks for a teammate in the direction you're pointing. NHL '95 changed one instruction
        in how it works that direction out, compared with NHL 94, and now and then the pass goes somewhere you didn't
        aim. Match Viewer played the same 31 passes on the WN95HL's Season 18 ROM with and without the fix:
      </p>
      <ul className="note">
        <li>26 went exactly the same.</li>
        <li>
          Twice, a player facing right, with a teammate off at an angle on that side, passed straight across instead of to him.
          With the fix, the pass went to the teammate.
        </li>
        <li>
          Three times, a player facing on a diagonal passed back to a teammate well behind him. With the fix, the pass
          went the way he was facing.
        </li>
      </ul>
      <p className="note">
        The fix puts back NHL 94's instruction. Only the regular pass (B) changes; the soft pass (A) works out its
        direction another way and never changes (18 of 18 the same). The game uses the same step to turn computer players
        in other situations, so they may move a little differently too. An option, not a recommended fix: some leagues
        may prefer passing as NHL '95 has always done it.
      </p>
    </>
  ),
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
        Changes to NHL '95 itself: NHL 94's fixes where NHL '95 has the same code, and NHL '95's own, from the NHL94
        Match Viewer project's reading of the game's code. The rest of NHL 94's hacks were made for NHL 94's code and are
        not offered here. The page shows what this ROM has now. Test a hacked ROM in a game before a league plays on it.
      </p>
      <HackShortcuts
        onRecommended={null}
        discordText={() => nhl95HacksForDiscord(project.bytes, name)}
        discordMessages={() => hackSheetDiscord(nhl95HackSheet(project.bytes, name))}
        sheet={() => hackSheetHtml(nhl95HackSheet(project.bytes, name))}
        name={name}
      />
      {NHL95_HACK_SECTIONS.map((section) => (
        <section key={section.id} id={`hacks-${section.id}`}>
          <h3>{section.title}</h3>
          {section.hacks.map((hack) => (
            <div className="hack" key={hack}>
              <label>
                <b>{NHL95_HACK_TITLES[hack]}</b>{' '}
                <select
                  aria-label={NHL95_HACK_TITLES[hack]}
                  disabled={unknown(hack)}
                  value={wanted[hack] ? 'on' : 'off'}
                  onChange={(e) => {
                    setDraft({ rom: project.bytes, choices: { ...wanted, [hack]: e.target.value === 'on' } })
                    setNotice('')
                    setError('')
                  }}
                >
                  <option value="off">Off</option>
                  <option value="on">On</option>
                </select>
              </label>
              <p className="summary">
                {SUMMARIES[hack]}
                {unknown(hack) && <b> This ROM's code here is neither the original game's nor this hack's, so it is left exactly as it is.</b>}
              </p>
              <details className="more">
                <summary>More about it</summary>
                {MORE[hack]}
              </details>
            </div>
          ))}
        </section>
      ))}
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
