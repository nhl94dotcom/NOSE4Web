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
  fighting: 'Players can fight. Adds a Fighting setting to Game Setup: Off, On, or On - Arcade Mode.',
  threeOnThree: 'Overtime is 3 on 3, as in the NHL; a penalty makes it 4 on 3. Playoff games stay 5 on 5.',
  threeOnThreeAll: 'Every overtime is 3 on 3, playoffs included; a penalty makes it 4 on 3.',
  fightingOff: 'What the Fighting setting on Game Setup starts at when the game is switched on. Players can still change it.',
  fightingArcade: '',
  organResume: 'After a pause the organ carries on with its song from where it was, instead of staying quiet.',
  runawayFix: 'A skater no longer glides on, barely slowing, after a fall into the boards or after you take him over.',
  goaliePullFix: 'In the last minute the computer pulls its goalie when one or two goals behind, not only when exactly two.',
  snipingFix: "With its goalie off the ice, a team's shots take the normal accuracy roll instead of always going exactly where aimed.",
  penaltyShotTableFix: 'Each foul on a breakaway gives its own penalty shot, not the next foul along.',
  penaltyShotFixes: 'A penalty shot stopped by a stray whistle is not taken again, and no "ghost puck" floats through everything.',
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

const FIGHT_START = 'Fighting setting at power-on'

// The line each tested option ends with.
const TESTED = 'Tested in the game by the NHL94 Match Viewer project.'
// NHL 94's fixes, where NHL '95 has the same code.
const FROM_94 = `NHL 94's fix, at NHL '95's places (also in the WN95HL's ROMs). ${TESTED}`

const OT3_MORE = (
  <p className="note">
    Each team plays its goalie, centre, left wing and right defenceman. A penalty gives the other team an extra
    skater (4 on 3, or 5 on 3 with two). When it ends the teams play 4 on 4 until the next stoppage, then 3 on 3
    again. With three of a team in the box at once, that team plays two skaters: the game has no room for more. A
    penalty from the third period carries into overtime, and line changes On or Off make no difference. Only one of the
    two can be on. {TESTED}
  </p>
)

const MORE: Record<Nhl95Hack, ReactNode> = {
  threeOnThree: OT3_MORE,
  threeOnThreeAll: OT3_MORE,
  fightingOff: (
    <p className="note">
      The fighting patch starts the game with Fighting set to On. A league can choose Off instead, so a game has no
      fights unless the players turn them on, or On - Arcade Mode. Players can still change it on Game Setup. Needs
      Fighting. {TESTED}
    </p>
  ),
  fightingArcade: null,
  organResume: (
    <p className="note">
      Pausing the game stops the organ, and it stays quiet after the pause until the next song starts. With this on
      the organ carries on with its song from where it was. A note that was sounding when the game was paused is heard
      again at the song's next note. {TESTED}
    </p>
  ),
  runawayFix: (
    <p className="note">
      Now and then a skater glides on, barely slowing, when he should be slowing down: most often after getting up from
      a fall into the boards, when the glide can last a second or two. The game lets a skater glide while a pass comes
      to him, after he is knocked into the boards and during a one-timer, and can leave it on afterwards. This turns it
      off in all three places, so he skates normally. In NHL '95 a speed burst already ends the glide, so it never
      becomes NHL 94's runaway. {FROM_94}
    </p>
  ),
  goaliePullFix: (
    <p className="note">
      In the last minute of the third period the computer pulls its goalie for an extra attacker, but only when exactly
      two goals behind, never when one down. With this on it pulls him when one or two behind, as a real coach would.
      While he is out, the computer's shots within range go exactly where aimed unless the pulled-goalie sniping fix is
      on too. {FROM_94}
    </p>
  ),
  snipingFix: (
    <p className="note">
      An option, a matter of taste: some leagues like it as it is. Whenever a team's goalie is off the ice (on a
      delayed penalty, or pulled late in a game) the game makes every one of its shots from within range go exactly
      where aimed, whatever the shooter's Shot Accuracy. With the fix such a shot takes the normal accuracy roll. Shots
      at an empty net are not affected. {FROM_94}
    </p>
  ),
  penaltyShotTableFix: (
    <p className="note">
      A foul on a skater on a breakaway can give a penalty shot. The game looks each foul up one place too far along
      its table, so every penalty shot is called for the wrong foul: charging as slashing, slashing as roughing, and so
      on. This gives each foul its own. Which fouls give penalty shots does not change. {FROM_94}
    </p>
  ),
  penaltyShotFixes: (
    <p className="note">
      Two penalty shot bugs. A penalty shot stopped by a whistle that is not one of its own endings, such as the puck
      going over the glass, is taken all over again; with the fix the game goes on to a faceoff. And a puck shot over
      the glass just before a penalty shot can enter it unable to touch anything, floating through the net and the
      boards (the "ghost puck"); with the fix it plays normally. {FROM_94}
    </p>
  ),
  fighting: (
    <p className="note">
      Brings back the fight EA drew for NHL '95 and left unused: Vancecookcobxin's fighting patch, with a fix by the
      NHL94 Match Viewer project. A hard check can start a fight between two players with Fighting ratings (in
      Handed/Fighting), more often as a game gets rougher; to start one a player needs 71 or more (42 in Arcade Mode),
      and his opponent 14 or more. They trade punches (C high, B low, A grab) until one goes down, and both get five
      minutes. Game Setup gets a Fighting setting: Off, On, or On - Arcade Mode, with more fights. The WN95HL's Season 18
      ROM rates no player for fighting, so it needs ratings before anyone fights. {TESTED}
    </p>
  ),
  secondAssist: (
    <>
      <p className="note">
        The game keeps a list of the last three players of a team to touch the puck: the scorer and his two assists.
        When two players pass back and forth, the list moves down at each touch, so the earlier passer drops off and
        the goal has only one assist. The fix moves the list down only when the new toucher is not the first assist
        already. {FROM_94}
      </p>
    </>
  ),
  oneTimerAssist: (
    <p className="note">
      A one-timer puts the shooter on the list by its own three moves, without the checks a touch makes, so where his
      stick touched the pass before he shot the list reads shooter, shooter, passer, and the goal has no assist. The
      fix uses a touch's own update there. {FROM_94}
    </p>
  ),
  regainAssist: (
    <p className="note">
      When the other team takes the puck, the game marks the list so the next touch replaces the last toucher. A
      player who wins the puck straight back skips the step that clears the mark, so the teammate he passes to
      replaces him and his assist is lost. {FROM_94}
    </p>
  ),
  aggressionFix: (
    <p className="note">
      The game cuts Aggression down to size by keeping only part of the number, so it wraps round: a 4 plays like a 1,
      and a 6 or a 3 is the most penalised. The fix scales it properly, so more Aggression always means more penalties.
      Goalies play as before. {FROM_94}
    </p>
  ),
  comebackFix: (
    <p className="note">
      A team tied or behind in the third period is meant to get a small boost late on, but the test of the clock is the
      wrong way round, so the boost comes while more than half the period is left and goes for the rest. Overtime is not
      affected: both teams have it throughout. {FROM_94}
    </p>
  ),
  openNetFix: (
    <p className="note">
      The game aims one-timers itself. When the goalie has wandered out of position, it aims just under the crossbar,
      and close in about 4 in 10 go over or hit the bar. The fix aims at the middle of the net instead, as it does with
      no goalie at all. Penalty shots and shootouts are unchanged. An option, not a recommended fix. {FROM_94}
    </p>
  ),
  blindRingFix: (
    <p className="note">
      When a low loose puck comes near a goalie's stick, the game leaves it to the stick and skips the goalie's body. But
      the stick only takes a puck right at its blade, so a puck in between touches nothing and slides on, which is how
      some five-hole goals go in. NHL '95's gap is bigger than NHL 94's. The fix lets the goalie's body play those pucks,
      saving or holding them by his ratings; everything else is as before. An option, not a recommended fix. {FROM_94}
    </p>
  ),
  nhlShootout: (
    <p className="note">
      The game plays every shootout to five rounds, even when one team can no longer catch up. With this on it follows
      today's NHL rule: three rounds, then sudden death, and it ends as soon as the result is settled (for example after
      the home team's third shot when it trails by two). The home team shoots first. For Shootout mode on the main menu
      and the regular-season shootouts above. {TESTED}
    </p>
  ),
  seasonShootout: (
    <p className="note">
      A regular-season game still tied after its overtime goes to a shootout, played as in Shootout mode: five shooters a
      side, then sudden death. The winners get one goal more in the score, so the game never ends in a tie. The shootout
      itself counts in no statistics. Playoff games are unchanged. Only one of the three ways of settling a tie can be
      on. {TESTED}
    </p>
  ),
  seasonShootoutNow: (
    <p className="note">
      A regular-season game tied after period 3 goes straight to a shootout, with no overtime, played and counted as the
      shootout after overtime is. Playoff games are unchanged. Only one of the three ways of settling a tie can be on.{' '}
      {TESTED}
    </p>
  ),
  seasonOvertime: (
    <p className="note">
      In the original game a regular-season game still tied after one overtime ends in a tie, while a playoff game
      (exhibition playoffs, or a season's playoffs) plays another overtime, and another, until a goal. With this on the
      regular season plays on the same way, each overtime as long as the ROM's own (10 minutes in the original game, 5
      in the WN95HL's). {TESTED}
    </p>
  ),
  rocketFix: (
    <p className="note">
      The game aims a pass at where its receiver will be: it works out when the two meet, in whole eighths of a second,
      and sets the puck's speed to cover the distance in that time. It rounds the time down, so some passes go nearly
      twice as fast as they should, and a few far faster. The fix works the time out in 64ths of a second, so passes go
      at their own speed. NHL '95's slow flat pass still takes four times as long, and the receiver waits for it as he
      does in the original. {FROM_94}
    </p>
  ),
  passFix: (
    <p className="note">
      When you pass, the game looks for a teammate in the direction you're pointing. NHL '95 changed one instruction in
      how it works that direction out, so now and then a pass goes straight across instead of to a teammate off at an
      angle, or back to a teammate behind the passer. The fix puts back NHL 94's instruction. Only the regular pass (B)
      changes, not the soft pass (A). The game uses the same step to turn computer players, so they may move a little
      differently too. An option, not a recommended fix: some leagues may prefer passing as NHL '95 has always done it.{' '}
      {TESTED}
    </p>
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
          {/* The Fighting setting at power-on is one choice of three, kept as two options (Off, Arcade Mode). */}
          {section.hacks.filter((hack) => hack !== 'fightingArcade').map((hack) => (
            <div className="hack" key={hack}>
              <label>
                <b>{hack === 'fightingOff' ? FIGHT_START : NHL95_HACK_TITLES[hack]}</b>{' '}
                <select
                  aria-label={hack === 'fightingOff' ? FIGHT_START : NHL95_HACK_TITLES[hack]}
                  disabled={unknown(hack) || (hack === 'fightingOff' && !wanted.fighting)}
                  value={hack === 'fightingOff' ? (wanted.fightingOff ? 'off' : wanted.fightingArcade ? 'arcade' : 'on') : wanted[hack] ? 'on' : 'off'}
                  onChange={(e) => {
                    setNotice('')
                    setError('')
                    if (hack === 'fightingOff') {
                      const start = e.target.value
                      setDraft({ rom: project.bytes, choices: { ...wanted, fightingOff: start === 'off', fightingArcade: start === 'arcade' } })
                      return
                    }
                    const on = e.target.value === 'on'
                    // The three ways of settling a tie exclude each other: one on turns the others off.
                    const ties = ['seasonOvertime', 'seasonShootout', 'seasonShootoutNow'] as const
                    const others = on && (ties as readonly string[]).includes(hack) ? Object.fromEntries(ties.filter((t) => t !== hack).map((t) => [t, false])) : {}
                    // The two 3 on 3 choices exclude each other.
                    if (hack === 'threeOnThree' && on) Object.assign(others, { threeOnThreeAll: false })
                    if (hack === 'threeOnThreeAll' && on) Object.assign(others, { threeOnThree: false })
                    // Without fighting, its setting at power-on goes back to On.
                    if (hack === 'fighting' && !on) Object.assign(others, { fightingOff: false, fightingArcade: false })
                    setDraft({ rom: project.bytes, choices: { ...wanted, ...others, [hack]: on } })
                  }}
                >
                  <option value="off">Off</option>
                  <option value="on">On</option>
                  {hack === 'fightingOff' && <option value="arcade">On - Arcade Mode</option>}
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
