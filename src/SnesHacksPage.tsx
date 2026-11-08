import { useMemo, useState, type ReactNode } from 'react'
import type { RomProject } from './core/rom'
import { CopyHacksButton } from './CopyHacksButton'
import { HackShortcuts } from './HackShortcuts'
import {
  applySnesHacks,
  detectSnesHacks,
  SNES_HACK_TITLES,
  SNES_HACKS,
  snesHacksCopiedFrom,
  snesHacksForDiscord,
  withRecommendedSnesFixes,
  type SnesHack,
  type SnesHackChoices,
} from './core/sneshacks'

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
      the ones that play. It changes how every game plays, so try it before a league uses it.
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
    "In Edit Lines, picking a line's extra attacker for one of its positions puts him in both places and drops the player he replaced from the line, so the line has one skater too few. With the fix the two swap, as they do for any other move within the line. This is McMarkis's fix from NHL94SNESVault, as it has it. It can only go into ROMs laid out like the original game.",
  yButtonFix:
    'A skater who has been knocked down, or is falling into the boards, being held or in any other move that locks him, can still hook or hold with Y, where every other button does nothing until he is free. With the fix Y waits too. (NHL94SNESVault has a fix for a skater knocked down; this covers every locked move.)',
  comebackFix:
    'A team tied or behind late in the third period is meant to get a bonus (+2 Offensive Awareness, +2 Checking and more passing and shooting), but the clock test is the wrong way round, so it comes in the first half of the period and not the second. This makes it come when it should. Overtime is not affected. As on the Genesis; found by the NHL94 Match Viewer project and tested in the game.',
  awarenessFix:
    "An option. A computer skater decides what to do next at intervals set by his awareness: Offensive Awareness when his team has the puck, Defensive when it does not. But computer wingers and centres on offence use their Defensive Awareness, a slip in the game's code. With this on they use Offensive. A small change. As on the Genesis; found by the NHL94 Match Viewer project and tested in the game.",
  penaltyShotFixes:
    'A penalty shot whistled dead because the net was knocked off, or because the loose puck stopped moving for two seconds, is taken all over again, from the side, as the original game leaves it pending. With the fix those whistles end the penalty shot, as a goal or the puck hitting the boards does, and play goes on to a faceoff.',
  faceoffFix:
    "Faceoffs as today's NHL rules have them. Only since 2007 has the NHL held every faceoff on one of the nine dots; before that a faceoff was often held where play stopped, and the game follows that older way, putting one on a dot only when play stops past the hash marks. With this on, every faceoff is on a dot: after a goal at centre; after a penalty in the offending team's own end, at the dot on the side the puck was; otherwise past a blue line at that end's dot on the puck's side, and in the neutral zone at the nearest neutral-zone dot. Leave it off to keep the game's own 1990s-style faceoffs. Worked out with the NHL94 Match Viewer project, from today's NHL rulebook.",
}

const GROUPS: { title: string; hacks: SnesHack[] }[] = [
  { title: 'Fixes', hacks: ['hotColdFix', 'ppPkFix', 'comebackFix', 'faceoffFix', 'penaltyShotFixes', 'extraAttackerFix', 'yButtonFix', 'awarenessFix'] },
  { title: 'Rules and play', hacks: ['defenceControl', 'oneMinutePenalties', 'thirtySecondPeriods', 'noInterference', 'noPenaltyShots', 'noGoalPosts'] },
  { title: 'Starting up', hacks: ['skipEaIntro', 'skipPucksIntro'] },
]

const sameChoices = (a: SnesHackChoices, b: SnesHackChoices) => SNES_HACKS.every((hack) => a[hack] === b[hack])

export function SnesHacksPage({ project, name, onChange }: Props) {
  const state = useMemo(() => detectSnesHacks(project.bytes), [project.bytes])
  // The choices being made, which start again from the ROM whenever it changes.
  const [draft, setDraft] = useState({ rom: project.bytes, choices: state.choices })
  if (draft.rom !== project.bytes) setDraft({ rom: project.bytes, choices: state.choices })
  const wanted: SnesHackChoices = draft.rom === project.bytes ? draft.choices : state.choices
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  // What could not be copied from another ROM's hacks, if they were.
  const [notCopied, setNotCopied] = useState<string[]>([])
  const changed = SNES_HACKS.filter((hack) => wanted[hack] !== state.choices[hack])

  function apply() {
    try {
      onChange(applySnesHacks(project, wanted))
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
            setDraft({ rom: project.bytes, choices: withRecommendedSnesFixes(wanted, state.unknown) })
            setNotice('')
            setError('')
          })
        }
        discordText={() => snesHacksForDiscord(project.bytes, name)}
      />
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3>{group.title}</h3>
          {group.hacks.map((hack) => {
            const unknown = state.unknown.includes(hack)
            return (
              <div className="hack" key={hack}>
                <label>
                  <b>{SNES_HACK_TITLES[hack]}</b>{' '}
                  <select
                    aria-label={SNES_HACK_TITLES[hack]}
                    disabled={unknown}
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
                <p className="note">
                  {ABOUT[hack]}
                  {unknown && <b> This ROM has something else in its place, so it is left exactly as it is.</b>}
                </p>
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
              setDraft({ rom: project.bytes, choices: state.choices })
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
              setDraft({ rom: project.bytes, choices: copied.choices })
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
                  {SNES_HACK_TITLES[hack]}: {state.choices[hack] ? 'on' : 'off'} to {wanted[hack] ? 'on' : 'off'}.
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
