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
  fighting: 'Players can fight: now and then a hard check between two players who fight starts one. Off, On or Arcade Mode on Game Setup.',
  threeOnThree: 'Overtime is 3 on 3, as in the NHL; a penalty makes it 4 on 3. Playoff games stay 5 on 5.',
  threeOnThreeAll: 'Every overtime is 3 on 3, playoffs included; a penalty makes it 4 on 3.',
  fightingOff: "The Game Setup screen's Fighting row starts at Off when the game is switched on; players can still choose On or Arcade Mode.",
  secondAssist: 'When two players pass back and forth before a goal, the second assist is credited.',
  oneTimerAssist: "A one-timer goal keeps its assists when the shooter's stick touched the pass before he shot.",
  regainAssist: 'A player who wins the puck back himself and passes to the scorer gets his assist.',
  aggressionFix: 'Aggression works as the rating reads, where the original wraps it round (a 4 plays like a 1).',
  comebackFix: 'A team tied or behind in the third period gets its boost in the second half of it, not the first.',
  openNetFix: 'A one-timer at an open net is aimed at the middle of the net, not just under the crossbar.',
  blindRingFix: "A loose puck near the goalie's stick but off its blade meets the goalie, where the original lets it through.",
  seasonOvertime: 'A tied regular-season game plays overtime after overtime until a goal, as the playoffs do.',
  seasonShootout: 'A regular-season game still tied after overtime is settled by a shootout.',
  nhlShootout: "Shootouts follow today's NHL rule: three rounds, then sudden death, over once a team can't catch up.",
  seasonShootoutNow: 'A regular-season game tied after period 3 goes straight to a shootout, with no overtime.',
  rocketFix: 'Passes go at their own speed: no more rocket passes, sent much faster because the game rounds their time down.',
  passFix: "Passes go to the teammate you're pointing at, as in NHL 94, instead of sometimes straight across or back behind the passer.",
}

// NHL 94's fixes, tested in NHL '95 too.
const TESTED =
  "NHL '95's code here is NHL 94's instruction for instruction (from the NHL95Genesis disassembly), so it has the same bug, and NHL 94's fix goes in unchanged at NHL '95's addresses, also in the WN95HL's ROMs. Tested in the game by the NHL94 Match Viewer project on the original game and the WN95HL's Season 18 ROM."
// The assist fixes, with what was tested.
const ASSISTS_TESTED =
  "NHL '95's code here is NHL 94's instruction for instruction (from the NHL95Genesis disassembly), so it has the same bug, and NHL 94's fix goes in unchanged at NHL '95's addresses, also in the WN95HL's ROMs. Tested in the game by the NHL94 Match Viewer project on the original game and the WN95HL's Season 18 ROM, with the game's own code doing every pickup, pass and shot: a player who wins the puck back and passes to the scorer gets the assist, a give-and-go credits both passers, and a one-timer whose shooter's stick touched the pass keeps its two assists, where the original gives none; a plain one-timer and a teammate's regained puck are as before."

const OT3_MORE = (
  <p className="note">
    Each team plays its goalie and three skaters from the line on the ice: the centre (for the draws), the left wing
    and the right defenceman. A penalty gives the other team a skater more, 4 on 3, then 5 on 3 with a second one, and
    a team never has more than two skaters more than the other. When a penalty ends the player comes back, 4 on 4,
    and at the next stoppage it is 3 on 3 again; a penalty from the third period carries into overtime. With the goalie
    pulled, a team plays four skaters. Line changes On or Off make no difference. NHL 94's option, which the NHL94
    Match Viewer project tested and helped put right, made from NHL '95's code at its own places, also in the WN95HL's
    ROMs. Not yet tested in an NHL '95 game. Only one of the two can be on; it works with overtime until a goal and the
    shootout after overtime.
  </p>
)

const MORE: Record<Nhl95Hack, ReactNode> = {
  threeOnThree: OT3_MORE,
  threeOnThreeAll: OT3_MORE,
  fightingOff: (
    <p className="note">
      The fighting patch sets its Game Setup row to On when the game is switched on. With this, it starts at Off, so a
      game has no fights unless the players turn them on; the row still offers On and On - Arcade Mode. It needs
      Fighting, and turns it on. Tested by the NHL94 Match Viewer project on the WN95HL's Season 18 ROM: the row reads
      Off at power-on and a whole game left at Off had no fights, while On still gave fights.
    </p>
  ),
  fighting: (
    <>
      <p className="note">
        EA drew a fight for NHL '95 and left it in the cartridge unused. Vancecookcobxin's fighting patch brings it back
        with the fight engine of the NHL 2026 - 94 Edition. Now and then a hard check between two players who fight starts
        one, more likely as a game gets rougher, never in overtime. The two drop their gloves and sticks and trade punches
        until one goes down; both get five minutes, and the winner's penalty shows a tick. With a controller you fight
        with C (high punch), B (low punch) and A (grab).
      </p>
      <p className="note">
        Who fights is the players' <b>Fighting</b> rating (in Handed/Fighting). Only a player rated 71 or more can start a
        fight (42 or more in Arcade Mode), and only against one rated 14 or more who has taken enough hits. In the
        original game nearly every player is rated. In the WN95HL's Season 18 ROM no player is, so there are no fights
        until a league rates some.
      </p>
      <p className="note">
        The Game Setup screen gets a Fighting row: Off, On (the default at power-on) or On - Arcade Mode, with more
        fights. The patch's code goes at $1E0000, which is free in the original game, the 34-team ROM and the WN95HL's
        ROMs. With the NHL94 Match Viewer project's fix: as the patch came, a register its fight check used was
        overwritten, so on 5- and 10-minute periods no fight could ever start. Match Viewer played it with the fix on the
        original game and the WN95HL's Season 18 ROM (its players given fighting ratings): fights start from hard checks,
        both fighters get five minutes, and Off means no fights. In 60 computer games on the original game with 5-minute
        periods there were 48 fights, about 0.8 a game: most in the third period, as games get rougher, none in the
        first.
      </p>
    </>
  ),
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
  nhlShootout: (
    <p className="note">
      The game plays every shootout to five rounds, even when one team can no longer catch up. With this on it follows
      today's NHL rule: three rounds, then sudden death, and it ends as soon as the result is settled (for example after
      the home team's third shot when it trails by two). The home team shoots first. For Shootout mode on the main menu
      and the regular-season shootouts above. NHL 94's option, made from NHL '95's code, which tests the end of a
      shootout the same way, also in the WN95HL's ROMs. Tested by the NHL94 Match Viewer project on the original game
      and the WN95HL's Season 18 ROM: in 16 shootouts each ended exactly where the NHL's rule says, after three
      rounds, part-way through one, or in sudden death.
    </p>
  ),
  seasonShootout: (
    <p className="note">
      A regular-season game still tied after its overtime goes to a shootout, played as in Shootout mode: five shooters a
      side, then sudden death. The winners get one goal more in the score, so the game never ends in a tie; the shootout
      itself counts in no statistics, the players' and goalies' stats, goals by period and scoring summary being kept as
      they were at the end of overtime. Playoff games are unchanged. NHL 94's option, made from NHL '95's code (the
      NHL95Genesis disassembly), also in the WN95HL's ROMs. Tested by the NHL94 Match Viewer project on the original
      game and the WN95HL's Season 18 ROM, in exhibition and season games: the shootout starts after the tied
      overtime, the end screens show its winner a goal up, every statistic is as it was before it, the standings give
      a win and a loss, and playoff and untied games play as before. Only one of the three ways of settling a tie can
      be on.
    </p>
  ),
  seasonShootoutNow: (
    <p className="note">
      A regular-season game tied after period 3 goes straight to a shootout, with no overtime, played and counted as the
      shootout after overtime is. Playoff games, exhibition or a season's, are unchanged. NHL 94's option, made from NHL
      '95's code, also in the WN95HL's ROMs. Tested by the NHL94 Match Viewer project on both, as the shootout after
      overtime was: it starts straight after period 3. Only one of the three ways of settling a tie can be on.
    </p>
  ),
  seasonOvertime: (
    <p className="note">
      In the original game a regular-season game still tied after one overtime ends in a tie, while a playoff game
      (exhibition playoffs, or a season's playoffs) plays another overtime, and another, until a goal. With this on the
      regular season plays on the same way, each overtime as long as the ROM's own (10 minutes in the original game, 5
      in the WN95HL's). NHL 94's option, made from the same two places in NHL '95's code (from the NHL95Genesis
      disassembly), also in the WN95HL's ROMs. Tested in NHL '95 games on the original and the WN95HL's ROM: exhibition
      and season games went to another overtime and ended on the goal, playoffs and untied games played as before.
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
                    const on = e.target.value === 'on'
                    // The three ways of settling a tie exclude each other: one on turns the others off.
                    const ties = ['seasonOvertime', 'seasonShootout', 'seasonShootoutNow'] as const
                    const others = on && (ties as readonly string[]).includes(hack) ? Object.fromEntries(ties.filter((t) => t !== hack).map((t) => [t, false])) : {}
                    // Fighting starts Off is part of fighting: it turns fighting on, and fighting off turns it off.
                    if (hack === 'fightingOff' && on) Object.assign(others, { fighting: true })
                    // The two 3 on 3 choices exclude each other.
                    if (hack === 'threeOnThree' && on) Object.assign(others, { threeOnThreeAll: false })
                    if (hack === 'threeOnThreeAll' && on) Object.assign(others, { threeOnThree: false })
                    if (hack === 'fighting' && !on) Object.assign(others, { fightingOff: false })
                    setDraft({ rom: project.bytes, choices: { ...wanted, ...others, [hack]: on } })
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
