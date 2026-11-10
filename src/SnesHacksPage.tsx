import { useMemo, useState, type ReactNode } from 'react'
import type { RomProject } from './core/rom'
import { CopyHacksButton } from './CopyHacksButton'
import { HackShortcuts } from './HackShortcuts'
import { hackSheetDiscord, hackSheetHtml, pictureItems, snesHackSheet, withPictures } from './core/hacksheet'
import {
  applySnesHacks,
  detectSnesHacks,
  SNES_HACK_TITLES,
  SNES_HACKS,
  snesHacksCopiedFrom,
  snesHacksForDiscord,
  withRecommendedSnesFixes,
  withSnesHackChoice,
  RECOMMENDED_SNES_HIT_ENERGY,
  RECOMMENDED_SNES_HOLD_ENERGY,
  SNES_AMOUNT_RANGES,
  RECOMMENDED_SNES_INJURY_BONUS,
  SNES_AMOUNTS,
  type SnesAmount,
  type SnesHack,
  type SnesHackChoices,
} from './core/sneshacks'

const RECOMMENDED_AMOUNTS: Record<SnesAmount, number> = {
  hitEnergy: RECOMMENDED_SNES_HIT_ENERGY,
  holdEnergy: RECOMMENDED_SNES_HOLD_ENERGY,
  injuryBonus: RECOMMENDED_SNES_INJURY_BONUS,
}
const FULL_ENERGY = 0x1000
const isAmount = (hack: SnesHack): hack is SnesAmount => (SNES_AMOUNTS as SnesHack[]).includes(hack)
// An energy amount as units and as a share of full energy.
const energyShare = (units: number) => (units === 0 ? 'Off: none taken.' : `${units} units, ${Math.round((units / FULL_ENERGY) * 1000) / 10}% of full energy.`)
// The injury risk: what it adds to a hit that can injure, at most.
const riskShare = (bonus: number) => (bonus === 0 ? 'Off.' : `Up to ${bonus * 5} impact after 5 knockdowns: about ${Math.round(((bonus * 5) / 300) * 100)} in 100 more on a hit that can injure.`)
const amountText = (hack: SnesAmount, value: number) => (hack === 'injuryBonus' ? riskShare(value) : energyShare(value))

interface Props {
  project: RomProject
  // The ROM's name, for the Discord post.
  name: string
  onChange: (project: RomProject) => void
}

const ABOUT: Record<SnesHack, ReactNode> = {
  hotColdFix: (
    <>
      Before each game the SNES makes every player a little hot or cold in each rating, but a bug turns every cold
      value into a large one, so about half of every player's ratings play at the maximum, 15, whatever they are in the
      ROM. This fixes it, so that hot and cold move a rating by a point or so either way and the ratings you set are
      the ones that play. It changes how every game plays, so try it before a league uses it: without the bug every player plays lower than players are used to, so it suits a league whose ratings are set higher. It is not among the recommended fixes.
    </>
  ),
  ppPkFix: (
    <>
      The game is meant to add a team's power play rating to some of each player's ratings on the power play
            and take its penalty kill rating off them on the penalty kill, but it reads the two from the wrong halves
            of their byte. The original rosters were written for the intended way, so in play Anaheim, meant to be weak
            at both, has the best power play and penalty kill. This makes the game read them as intended, so rosters
            play as their makers meant; the team page then shows the two that way round too. Leagues that have already
            set these ratings as the editor showed them before the fix should check them after it.
    </>
  ),
  defenceControl: 'Turns defence control on for both teams at the start of every game, where the original game starts with it off.',
  oneMinutePenalties: 'Makes every minor penalty one minute long instead of two.',
  thirtySecondPeriods: 'Adds 30 seconds to the period lengths on the main menu. It is in the original game, but hidden.',
  noInterference: 'Interference is never called.',
  noPenaltyShots: 'A foul on a breakaway is called as an ordinary penalty, never a penalty shot.',
  noGoalPosts: 'A puck that reaches the net between the posts is always a goal: it never rings off the post or the crossbar.',
  skipEaIntro: 'Starts the game without the EA logo.',
  skipPucksIntro: 'Starts the game without the flying pucks.',
  extraAttackerFix:
    "In Edit Lines, picking a line's extra attacker for one of its positions puts him in both places and drops the player he replaced from the line, so the line has one skater too few. With the fix the two swap, as they do for any other move within the line. This is McMarkis's fix from NHL94SNESVault, in NOSE4Web's version, which also covers the penalty-kill lines, where the Vault's never finds the extra attacker (found by the NHL94 Match Viewer project). It can only go into ROMs laid out like the original game.",
  yButtonFix:
    'A skater who has been knocked down, or is falling into the boards, being held or in any other move that locks him, can still hook or hold with Y, where every other button does nothing until he is free. With the fix Y waits too. (NHL94SNESVault has a fix for a skater knocked down; this covers every locked move.) Players are used to the original, so it is not among the recommended fixes.',
  comebackFix:
    'A team tied or behind late in the third period is meant to get a bonus (+2 Offensive Awareness, +2 Checking and more passing and shooting), but the clock test is the wrong way round, so it comes in the first half of the period and not the second. This makes it come when it should. Overtime is not affected. As on the Genesis; found by the NHL94 Match Viewer project and tested in the game.',
  awarenessFix:
    "An option. A computer skater decides what to do next at intervals set by his awareness: Offensive Awareness when his team has the puck, Defensive when it does not. But computer wingers and centres on offence use their Defensive Awareness, a slip in the game's code. With this on they use Offensive. A small change. As on the Genesis; found by the NHL94 Match Viewer project and tested in the game.",
  secondAssist:
    "The game credits a goal's assists to the last two other players of the scoring team to touch the puck, but when the scorer touched it twice among them, as in a give-and-go (C passes to A, A to B, B back to A, who scores), it drops C's assist and credits only B. With the fix C gets the second assist, as on the Genesis. Found by the NHL94 Match Viewer project and tested in the game.",
  regainAssist:
    "When a player loses the puck to an opponent, wins it back himself, and passes to a teammate who scores, the original game loses his assist: a flag left from before the opponent's touch makes the scorer take his place among the last players to touch the puck. This clears the flag when he wins it back, so he keeps his place and gets the assist. About 1 goal in 29 in recorded games. Found by the NHL94 Match Viewer project and tested in the game; it goes with the second-assist fix or without it, in every build, and is among the recommended fixes.",
  stickShots:
    "A hard shot the goalie knocks away with his stick or glove, too fast for him to catch, is not counted as a shot on goal in the original game, only one he catches or stops with his body is, so those go missing from the totals. With this on they count once, for the shooter and his team and against the goalie. On the SNES this covers hard high shots off his stick or glove as well as low ones, more than on the Genesis: up to about 4 more shots on goal a game. Only the statistics change. Found by the NHL94 Match Viewer project and tested in the game.",
  penaltyShotFixes:
    'A penalty shot whistled dead because the net was knocked off, or because the loose puck stopped moving for two seconds, is taken all over again, from the side, as the original game leaves it pending. With the fix those whistles end the penalty shot, as a goal or the puck hitting the boards does, and play goes on to a faceoff.',
  forwardsAndDefence:
    "The game's own Edit Lines offers only forwards for the forward positions and only defencemen for the defence. With this on it lists every skater for every position, so players can put a forward on the point of a power play or a defenceman up front, and picking someone already on the line swaps the two, the extra attacker included. A player plays the position the line gives him. It needs the extra attacker fix, which turns on with it. NOSE4Web's own line editor offers any skater at any position in a ROM that has it. McMarkis's hack from NHL94SNESVault, tested in the game with the NHL94 Match Viewer project. It can only go into ROMs laid out like the original game.",
  showMaxBoost:
    "For a ROM that keeps the hot and cold bug. The bug puts about half of every player's ratings at the maximum in play, but Edit Lines and the team roster go on showing the value the game works out for display, so players cannot see who is really boosted. With this on they show such a rating as 100, as it plays; the overall shown does not change. It changes only what is shown, and cannot be on with the hot and cold bug fix, which removes the boost; turning either on turns the other off. McMarkis's hack from NHL94SNESVault, tested in the game with the NHL94 Match Viewer project, in NOSE4Web's version: it reads the stored hot or cold value, as play does, so it also catches the cold value of -1 the Vault's misses (about 1 rating in 28). It can only go into ROMs laid out like the original game.",
  manualPullGoalie:
    "During play, a player can press L and R together to pull his goalie for an extra attacker, and again to put him back, with a beep each time; he stays out through faceoffs until put back. Each press of L and R together (and nothing else) counts once, however short or long, and the goalie comes off or back within about half a second. It does nothing between whistles, while the game has the goalie out for a delayed penalty, or while the backup goalie is in net. With both players on one team, player 1 has it. McMarkis's hack from NHL94SNESVault, tested in the game with the NHL94 Match Viewer project, in NOSE4Web's version: the Vault's reads the buttons only every half second, so a quick tap was often missed and a long hold could pull the goalie and put him straight back. It can only go into ROMs laid out like the original game.",
  hitEnergy:
    "An option, from a community idea: a skater knocked down by a check or a poke check loses this much energy, so he is slower, shoots softer and loses puck battles more until he rests on the bench. 0 is the original game, where a hit costs the skater nothing. Only with line changes on, where the game's energy counts at all. Full energy is 4096 units; a burst of speed costs 204. Recommended: 204 (5%), what a burst costs, about 38 seconds of skating. Measured over computer games, it tires the most-hit players noticeably (their lowest energy about a tenth lower) while the average skater is hardly touched; people hit about twice as often; half as much was measured as too small to notice. Up to 1024, a quarter of full energy, for a league that wants hits to wear players down. A knockdown by the puck, a bump that does not knock him down, or a hit after the whistle costs nothing. As on the Genesis; read from the game's code by the NHL94 Match Viewer project, which measured the shifts and tested it in the game, in the original and McMarkis's SA-1 build: each knockdown and hold takes its amount once, and nothing with line changes Off. As the game's own energy drain, Automatic line changes count as on here (on the Genesis they do not). Found by the code around it, so it goes into every build.",
  holdEnergy:
    'The same for a skater caught by a hold or hook (Y), once each time it catches him in play. Recommended: 102 (2.5%), half a knockdown\'s. Only with line changes on.',
  injuryBonus:
    "An option, the other half of the community idea: each knockdown a skater takes makes a later injury a little more likely, and half of it wears off at each intermission. 0 is the original game. Only the few hits that can injure in the original game are affected (a puck carrier knocked onto his back while facing straight up or down the ice, with the clock running), so injuries stay rare: the game rolls 0 to 298 against the hit's impact, and this adds the number to the impact for each knockdown the skater has taken this game, the one being rolled for included, counting up to five. Recommended: 6, the Genesis's recommended effect: estimated from recorded SNES league games at about 27% more injuries a game, with the skaters knocked down most (5 times or more) about 1.35 times as likely to be hurt; each 1 more adds about 5% (19 comes to about 87% and 2.1 times). The estimates are indicative only, as those games had no injuries to check them against. Knockdowns in play are counted, with line changes on or off; those after the whistle are not. For the original game and its 1 MB edits; the rebuilt builds keep their memory elsewhere. Read from the game's code by the NHL94 Match Viewer project and tested in the game: each knockdown counts once, the counts start at 0 each game and halve at each intermission, and only hits that can already injure become likelier to.",
  fourthPeriodOvertime:
    "An option. A regular-season game played on the menu's fourth period length gets 99 minutes of overtime, about as good as no limit, which can save a league a separate playoff ROM. The fourth length is the one the 30-second periods hack offers, so that turns on with this; set its length and menu text with the others on the Game settings page (for example 5:00, \"5 Minutes, 99 Min OT\"). The other lengths keep the Clock's overtime, and playoff overtime stays as long as a period, as in the original game. McMarkis's Genesis patch, made for the SNES as NOSE4Web's Genesis option has it. Found by the code that sets the clock, so it goes into every build.",
  faceoffFix:
    "Faceoffs as today's NHL rules have them. Only since 2007 has the NHL held every faceoff on one of the nine dots; before that a faceoff was often held where play stopped, and the game follows that older way, putting one on a dot only when play stops past the hash marks. With this on, every faceoff is on a dot: after a goal at centre; after a penalty in the offending team's own end, at the dot on the side the puck was; otherwise past a blue line at that end's dot on the puck's side, and in the neutral zone at the nearest neutral-zone dot. Leave it off to keep the game's own 1990s-style faceoffs. Worked out with the NHL94 Match Viewer project, from today's NHL rulebook.",
}

// What NOSE4Web's version of a hack does better than NHL94SNESVault's.
const VAULT_VERSION_NOTE: Partial<Record<SnesHack, string>> = {
  hitEnergy: "NOSE4Web's first version (9 November 2026) also counted hits after the whistle, which the game itself never lets injure; this one counts only hits in play.",
  holdEnergy: "NOSE4Web's first version (9 November 2026) also counted hits after the whistle, which the game itself never lets injure; this one counts only hits in play.",
  injuryBonus: "NOSE4Web's first version (9 November 2026) also counted hits after the whistle, which the game itself never lets injure; this one counts only hits in play.",
  extraAttackerFix: "NHL94SNESVault's, on the penalty-kill lines, never finds the extra attacker, so picking him there still puts him on the line twice; NOSE4Web's covers every line. NOSE4Web's own fix was the Vault's before 9 November 2026.",
  showMaxBoost: "NHL94SNESVault's misses about 1 boosted rating in 28 (a cold value of -1), which NOSE4Web's shows as 100 too.",
  manualPullGoalie: "NHL94SNESVault's reads the buttons only about every half second, so a quick tap is often missed and a long hold can pull the goalie and put him straight back, and NOSE4Web's of the morning of 9 November 2026 can act on a press made in a short pause once play resumes; NOSE4Web's now acts once on each press made in play.",
}

const GROUPS: { title: string; hacks: SnesHack[] }[] = [
  { title: 'Fixes', hacks: ['hotColdFix', 'ppPkFix', 'comebackFix', 'faceoffFix', 'penaltyShotFixes', 'extraAttackerFix', 'yButtonFix', 'awarenessFix', 'secondAssist', 'regainAssist'] },
  { title: 'Statistics', hacks: ['stickShots'] },
  { title: 'Edit Lines and controls', hacks: ['forwardsAndDefence', 'showMaxBoost', 'manualPullGoalie'] },
  { title: 'Rules and play', hacks: ['defenceControl', 'oneMinutePenalties', 'thirtySecondPeriods', 'fourthPeriodOvertime', 'hitEnergy', 'holdEnergy', 'injuryBonus', 'noInterference', 'noPenaltyShots', 'noGoalPosts'] },
  { title: 'Starting up', hacks: ['skipEaIntro', 'skipPucksIntro'] },
]

const sameChoices = (a: SnesHackChoices, b: SnesHackChoices) => SNES_HACKS.every((hack) => a[hack] === b[hack])

export function SnesHacksPage({ project, name, onChange }: Props) {
  const state = useMemo(() => detectSnesHacks(project.bytes), [project.bytes])
  // The choices being made, which start again from the ROM whenever it changes.
  const hadAmounts: Record<SnesAmount, number> = state.amounts ?? { hitEnergy: 0, holdEnergy: 0, injuryBonus: 0 }
  const [draft, setDraft] = useState({ rom: project.bytes, choices: state.choices, amounts: hadAmounts })
  if (draft.rom !== project.bytes) setDraft({ rom: project.bytes, choices: state.choices, amounts: hadAmounts })
  const wanted: SnesHackChoices = draft.rom === project.bytes ? draft.choices : state.choices
  const wantedAmounts = draft.rom === project.bytes ? draft.amounts : hadAmounts
  const setAmount = (hack: SnesAmount, value: number) => {
    setDraft({ rom: project.bytes, choices: { ...wanted, [hack]: value > 0 }, amounts: { ...wantedAmounts, [hack]: value } })
    setNotice('')
    setError('')
  }
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  // What could not be copied from another ROM's hacks, if they were.
  const [notCopied, setNotCopied] = useState<string[]>([])
  const changed = SNES_HACKS.filter((hack) => wanted[hack] !== state.choices[hack] || (isAmount(hack) && wantedAmounts[hack] !== hadAmounts[hack]))

  function apply() {
    try {
      onChange(applySnesHacks(project, wanted, false, wantedAmounts))
      setNotice(`Done: ${changed.length === 1 ? '1 change' : `${changed.length} changes`} to the game. Undo puts it back.`)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <main className="team help">
      <h2>Hacks</h2>
      <p className="note">
        Changes to the SNES game itself, from the patches of the community's disassembly of the game,{' '}
        <a href="https://github.com/Mhopkinsinc/NHL94SNESVault" target="_blank" rel="noreferrer">
          NHL94SNESVault
        </a>
        . The page shows what this ROM has now. Change what you like and press Apply; nothing is changed until you do.
        Test a hacked ROM in a game before a league plays on it.
      </p>
      <HackShortcuts
        onRecommended={
          !sameChoices(withRecommendedSnesFixes(wanted, state.unknown), wanted) &&
          (() => {
            setDraft({ rom: project.bytes, choices: withRecommendedSnesFixes(wanted, state.unknown), amounts: wantedAmounts })
            setNotice('')
            setError('')
          })
        }
        discordText={() => snesHacksForDiscord(project.bytes, name, pictureItems(project).map((item) => `- **${item.title}**`))}
        discordMessages={() => hackSheetDiscord(withPictures(snesHackSheet(project.bytes, name), project))}
        sheet={() => hackSheetHtml(withPictures(snesHackSheet(project.bytes, name), project))}
        name={name}
      />
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3>{group.title}</h3>
          {group.hacks.map((hack) => {
            const unknown = state.unknown.includes(hack)
            return (
              <div className="hack" key={hack}>
                {isAmount(hack) ? (
                  <label>
                    <b>{SNES_HACK_TITLES[hack]}</b>{' '}
                    <input
                      type="number"
                      aria-label={SNES_HACK_TITLES[hack]}
                      disabled={unknown}
                      min={SNES_AMOUNT_RANGES[hack][0]}
                      max={SNES_AMOUNT_RANGES[hack][1]}
                      value={wantedAmounts[hack]}
                      onChange={(e) => setAmount(hack, Math.max(SNES_AMOUNT_RANGES[hack][0], Math.min(SNES_AMOUNT_RANGES[hack][1], Math.round(Number(e.target.value) || 0))))}
                    />{' '}
                    <span className="note">{amountText(hack, wantedAmounts[hack])}</span>{' '}
                    <button type="button" disabled={unknown || wantedAmounts[hack] === RECOMMENDED_AMOUNTS[hack]} onClick={() => setAmount(hack, RECOMMENDED_AMOUNTS[hack])}>
                      Use the recommended {RECOMMENDED_AMOUNTS[hack]}
                    </button>
                  </label>
                ) : (
                <label>
                  <b>{SNES_HACK_TITLES[hack]}</b>{' '}
                  <select
                    aria-label={SNES_HACK_TITLES[hack]}
                    disabled={unknown}
                    value={wanted[hack] ? 'on' : 'off'}
                    onChange={(e) => {
                      setDraft({ rom: project.bytes, choices: withSnesHackChoice(wanted, hack, e.target.value === 'on'), amounts: wantedAmounts })
                      setNotice('')
                      setError('')
                    }}
                  >
                    <option value="off">Off</option>
                    <option value="on">On</option>
                  </select>
                </label>
                )}
                <p className="note">
                  {ABOUT[hack]}
                  {unknown && <b> This ROM has something else in its place, so it is left exactly as it is.</b>}
                </p>
                {state.vaultVersions?.includes(hack) && (
                  <p className="note">
                    <b>This ROM has an earlier version of it.</b> {VAULT_VERSION_NOTE[hack]}{' '}
                    <button
                      onClick={() => {
                        try {
                          onChange(applySnesHacks(project, { [hack]: true }, true))
                          setNotice(`Done: ${SNES_HACK_TITLES[hack]} is now NOSE4Web's version. Undo puts it back.`)
                          setError('')
                        } catch (e) {
                          setError(e instanceof Error ? e.message : String(e))
                        }
                      }}
                    >
                      Put in NOSE4Web's version
                    </button>
                  </p>
                )}
              </div>
            )
          })}
        </section>
      ))}
      <section>
        <p>
          <button disabled={changed.length === 0} onClick={apply}>
            Apply
          </button>{' '}
          <button
            disabled={changed.length === 0}
            onClick={() => {
              setDraft({ rom: project.bytes, choices: state.choices, amounts: hadAmounts })
              setNotCopied([])
            }}
          >
            Set back to what the ROM has
          </button>{' '}
          <CopyHacksButton
            onRom={(other, fileName) => {
              if (other.game.platform !== 'snes') {
                setError(`${fileName} is ${other.game.title}, not an SNES ROM.`)
                return
              }
              const copied = snesHacksCopiedFrom(state, detectSnesHacks(other.bytes))
              const otherAmounts = detectSnesHacks(other.bytes).amounts ?? hadAmounts
              setDraft({
                rom: project.bytes,
                choices: copied.choices,
                amounts: Object.fromEntries(SNES_AMOUNTS.map((hack) => [hack, copied.choices[hack] ? otherAmounts[hack] : 0])) as Record<SnesAmount, number>,
              })
              setNotCopied(copied.notCopied)
              setNotice(`Set to ${fileName}'s hacks. Check the choices above and press Apply.`)
              setError('')
            }}
            onError={(message) => setError(message)}
          />{' '}
          <span className="note">{notice}</span>
        </p>
        {changed.length > 0 && (
          <div className="outcome">
            <p>Applying will make these changes to the game:</p>
            <ul>
              {changed.map((hack) => (
                <li key={hack}>
                  {SNES_HACK_TITLES[hack]}:{' '}
                  {isAmount(hack) ? `${hadAmounts[hack]} to ${wantedAmounts[hack]}` : `${state.choices[hack] ? 'on' : 'off'} to ${wanted[hack] ? 'on' : 'off'}`}.
                </li>
              ))}
            </ul>
          </div>
        )}
        {notCopied.length > 0 && (
          <div className="note">
            <p>Left as this ROM has them:</p>
            <ul>
              {notCopied.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  )
}
