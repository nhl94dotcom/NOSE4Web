import { useEffect, useMemo, useState } from 'react'
import { eraDraft, eraRules } from './core/erarules'
import { offerOnly, offersOnly } from './core/seasonmenu'
import { overallRating } from './core/rating'
import type { RomProject } from './core/rom'
import {
  allStarSlots,
  applySeason,
  DEFAULT_SEASON_OPTIONS,
  defaultPlacement,
  parseSeason,
  rateSeason,
  rerateByName,
  seasonBuilderSupported,
  seasonLabel,
  type Season,
  type SeasonOptions,
} from './core/seasonbuilder'
import { teamLabels } from './core/team'
import { applyHackDraft } from './hackdraft'

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
}

// The season files sit beside the site (scripts/fetch-seasons.mjs).
const load = (file: string) =>
  fetch(`seasons/${file}`).then((r) => {
    if (!r.ok) throw new Error(`The season data could not be loaded (${r.status}).`)
    return r.json()
  })

export function RealSeasonPage({ project, onChange }: Props) {
  const [seasons, setSeasons] = useState<string[]>([])
  const [franchises, setFranchises] = useState<Record<string, string[]>>({})
  const [chosen, setChosen] = useState('')
  const [season, setSeason] = useState<Season | null>(null)
  const [placement, setPlacement] = useState<(number | null)[]>([])
  const [options, setOptions] = useState<SeasonOptions>(DEFAULT_SEASON_OPTIONS)
  const [shown, setShown] = useState(0)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const [rerateNotes, setRerateNotes] = useState<string[]>([])
  const [rulesNote, setRulesNote] = useState('')
  const [menuNote, setMenuNote] = useState<{ text: string; failed: boolean } | null>(null)
  const supported = seasonBuilderSupported(project.game)

  useEffect(() => {
    if (!supported) return
    Promise.all([load('index.json'), load('franchises.json')])
      .then(([list, names]: [string[], Record<string, string[]>]) => {
        setSeasons(list)
        setFranchises(names)
        // The season the original game's ratings come from, to begin with.
        setChosen(list.includes('19921993') ? '19921993' : list[list.length - 1])
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [supported])

  useEffect(() => {
    if (!chosen) return
    let current = true
    setSeason(null)
    load(`${chosen}.json`)
      .then((file) => {
        if (!current) return
        const next = parseSeason(file)
        setSeason(next)
        setPlacement(defaultPlacement(project, next, franchises))
        setShown(0)
        setNotes([])
        setRerateNotes([])
        setRulesNote('')
        setMenuNote(null)
        setError('')
      })
      .catch((e: unknown) => current && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      current = false
    }
    // The placement starts afresh only for a new season, not each change to the ROM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, franchises])

  // Rated with the options rateSeason reads (allStars only matters when the teams are brought in).
  const { goalies, forwards, defence, names: useNames, traded } = options
  const rated = useMemo(
    () => (season ? rateSeason(project.game, season, { goalies, forwards, defence, names: useNames, traded }) : null),
    [season, goalies, forwards, defence, useNames, traded, project.game],
  )
  const built = useMemo(() => rated?.teams ?? [], [rated])
  // The ROM's own players, re-rated where the season has them by name; the same as the button does, to count them.
  const rerate = useMemo(() => (season && rated ? rerateByName(project, season, rated) : null), [project, season, rated])
  // The season's rules for tied games, and the Hacks page choices that play them.
  const era = useMemo(() => (season ? eraRules(chosen) : null), [season, chosen])
  const eraPlan = useMemo(() => (era ? eraDraft(project, era) : null), [project, era])
  const ours = teamLabels(project.teams, project.game)
  // The places the season's teams go, and those of them the Game Setup menu does not offer.
  const placedSlots = placement.flatMap((s, slot) => (s === null ? [] : [slot]))
  const menuOffers = project.settings.menuTeams?.offered ?? project.teams.length
  const unoffered = placedSlots.filter((slot) => slot >= menuOffers)
  const placed = placement.filter((s) => s !== null).length
  // The ROM's teams a season's team can go to without being chosen by hand: all but its All-Star teams.
  const places = project.teams.filter((t) => !/all.?stars?/i.test(t.names.join(' '))).length

  if (!supported) {
    return (
      <main className="team help">
        <h2>Real NHL season</h2>
        <p className="note">This ROM's players have attributes of their own making, so a real season's players cannot be rated for it.</p>
      </main>
    )
  }

  function bringIn() {
    if (!season) return
    try {
      const result = applySeason(project, season, placement, options, built)
      onChange(result.project)
      setNotes(result.notes)
      setError('')
    } catch (e) {
      setNotes([])
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function rerateAll() {
    if (!rerate || rerate.rerated === 0) return
    onChange(rerate.project)
    setRerateNotes(rerate.notes)
  }

  function offerSeasonTeams() {
    if (!season) return
    try {
      const result = offerOnly(project, placedSlots)
      if ('reason' in result) {
        setMenuNote({ text: result.reason, failed: true })
        return
      }
      onChange(result.project)
      // The season's teams are now the first ones, in the order they were in.
      setPlacement(project.teams.map((_, n) => (n < placedSlots.length ? placement[placedSlots[n]] : null)))
      setMenuNote({
        text: `The menu now offers the ${placedSlots.length} teams of ${season.season}${result.offered > placedSlots.length ? ' and the All-Star teams' : ''}, and the playoff draws are made of them. The other teams are after them in the ROM.`,
        failed: false,
      })
    } catch (e) {
      setMenuNote({ text: e instanceof Error ? e.message : String(e), failed: true })
    }
  }

  function setRules() {
    if (!season || !eraPlan || eraPlan.count === 0) return
    try {
      onChange(applyHackDraft(project, eraPlan))
      setRulesNote(`The rules are now ${season.season}'s.`)
      setError('')
    } catch (e) {
      setRulesNote('')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const number = (key: 'goalies' | 'forwards' | 'defence', label: string, min: number, max: number) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={options[key]}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value))
          if (Number.isFinite(n)) setOptions({ ...options, [key]: Math.max(min, Math.min(max, n)) })
        }}
      />
    </label>
  )
  const view = built[shown]

  return (
    <main className="team help">
      <h2>Real NHL season</h2>
      <p className="note">
        Fills teams with the players of a real NHL season, 1967-68 on, rated from that season's stats: where each player
        stands among that season's players, given out in the same proportions as the original NHL 94's ratings, with no limit on top ratings. Each
        team gets the players with the most games for it, newly built lines, Offence and Defence ratings by its goals
        for and against, and (from 1977-78) power play and penalty kill ratings by that season's percentages. Undo
        takes it all back.
      </p>
      <div className="fields">
        <label>
          Season
          <select aria-label="Season" value={chosen} onChange={(e) => setChosen(e.target.value)}>
            {seasons.map((id) => (
              <option key={id} value={id}>
                {seasonLabel(id)}
              </option>
            ))}
          </select>
        </label>
        {number('goalies', 'Goalies', 1, 3)}
        {number('forwards', 'Forwards', 9, 15)}
        {number('defence', 'Defence', 6, 12)}
      </div>
      <p>
        <label className="choice">
          <input type="checkbox" checked={options.names} onChange={(e) => setOptions({ ...options, names: e.target.checked })} /> Use that
          season's team names (place, initials and nickname)
        </label>
      </p>
      <p>
        <label>
          A player traded during the season goes to{' '}
          <select aria-label="Traded players go to" value={options.traded} onChange={(e) => setOptions({ ...options, traded: e.target.value as SeasonOptions['traded'] })}>
            <option value="most">the team they played the most games for</option>
            <option value="last">the team they ended the season with</option>
          </select>
        </label>
      </p>
      {allStarSlots(project, project.teams.map(() => null)).length > 0 && (
        <p>
          <label className="choice">
            <input type="checkbox" checked={options.allStars ?? false} onChange={(e) => setOptions({ ...options, allStars: e.target.checked })} /> Fill
            the All-Star teams with that season's best players of each conference
          </label>
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {!season && !error && <p className="note">Loading the season…</p>}
      {season && (
        <>
          <h3>Where each team goes</h3>
          <p className="note">
            Each team goes where the ROM has the same team or franchise; the rest go to the teams left over. Choose
            Keep as it is for a team to leave alone.
          </p>
          <table className="season-placement">
            <tbody>
              {project.teams.map((_, slot) => (
                <tr key={slot}>
                  <td>{ours[slot]}</td>
                  <td>
                    <select
                      aria-label={`Season team for ${ours[slot]}`}
                      value={placement[slot] ?? ''}
                      onChange={(e) => {
                        const next = e.target.value === '' ? null : Number(e.target.value)
                        // A season team goes to one place only: where it was is kept as it is.
                        setPlacement(placement.map((s, i) => (i === slot ? next : s === next ? null : s)))
                      }}
                    >
                      <option value="">Keep as it is</option>
                      {season.teams.map((t, s) => (
                        <option key={s} value={s}>
                          {t.location} {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {season.teams.length > places && (
            <p className="note">
              {season.season} has {season.teams.length} teams, and this ROM has places for {places}, not counting its
              All-Star teams. To bring them all in, open a ROM with {season.teams.length} or more team places, such as a
              league's 32-team ROM.
            </p>
          )}
          {season.teams.some((_, s) => !placement.includes(s)) && (
            <p className="note">
              Not brought in:{' '}
              {season.teams
                .filter((_, s) => !placement.includes(s))
                .map((t) => `${t.location} ${t.name}`)
                .join(', ')}
              .
            </p>
          )}
          {unoffered.length > 0 && (
            <p className="note">
              The menu offers the first {menuOffers} teams, so {unoffered.map((slot) => `${season.teams[placement[slot]!].location} ${season.teams[placement[slot]!].name}`).join(', ')}{' '}
              {unoffered.length === 1 ? 'goes' : 'go'} where it cannot be picked. Choose {unoffered.length === 1 ? 'another place' : 'other places'}, or bring them in
              and then use Offer only these teams in the menu, below.
            </p>
          )}
          <p>
            <button disabled={placed === 0} onClick={bringIn}>
              Bring in {placed} {placed === 1 ? 'team' : 'teams'} from {season.season}
            </button>
          </p>
          {notes.length > 0 && (
            <ul>
              {notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
          {project.settings.menuTeams && placed > 0 && (
            <>
              <h3>Offer only these teams in the menu</h3>
              <p className="note">
                After bringing them in: the {placed} teams of {season.season} go to the top of the team list, the
                Game Setup menu offers only them (and the All-Star teams), and new playoff draws are made of them. The
                other teams stay in the ROM, after them, as they are. Do this once the teams are in. Undo takes it back.
              </p>
              <p>
                <button disabled={offersOnly(project, placedSlots)} onClick={offerSeasonTeams}>
                  {offersOnly(project, placedSlots) ? `The menu offers only the teams of ${season.season}` : `Offer only the ${placed} teams of ${season.season} in the menu`}
                </button>
              </p>
              {menuNote && <p className={menuNote.failed ? 'error' : undefined}>{menuNote.text}</p>}
            </>
          )}
          <h3>Re-rate the players this ROM has</h3>
          <p className="note">
            Or keep the ROM's teams and rosters as they are, and give each player found by name in {season.season} the
            ratings that season gives them (weight and hands too). Everyone who played counts: a player with too few games
            for a roster is rated against those who made one. Players not in the season keep their ratings. A name the
            season has twice is matched by number as well; a first initial and last name (J. Giguere), or a last name
            with letters left out (Feathrston), is matched where only one player fits. The list after shows each match
            made that way, to check.
          </p>
          <p>
            <button disabled={!rerate || rerate.rerated === 0} onClick={rerateAll}>
              Re-rate {rerate?.rerated ?? 0} {rerate?.rerated === 1 ? 'player' : 'players'} found in {season.season}
            </button>
          </p>
          {rerateNotes.length > 0 && (
            <ul>
              {rerateNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
          <h3>That season's rules</h3>
          {era?.texts.map((text, i) => (
            <p key={i} className="note">
              {text}
            </p>
          ))}
          {era && eraPlan && (
            <>
              <p className="note">
                This sets the Hacks page's rules to match:{' '}
                {era.shootout
                  ? `a shootout after one overtime, the three-round shootout, and ${era.threeOnThree ? '3 on 3 overtime in the regular season' : 'overtime 5 on 5'}.`
                  : 'a tied game ends in a tie after one overtime, played 5 on 5.'}{' '}
                The playoffs play overtime until a goal, 5 on 5, as they did then. The overtime's length stays as Game
                settings has it. Undo takes it back.
              </p>
              {eraPlan.skipped.length > 0 && (
                <p className="note">This ROM has its own code for these, so they stay as they are: {eraPlan.skipped.join(', ')}.</p>
              )}
              <p>
                <button disabled={eraPlan.count === 0} onClick={setRules}>
                  {eraPlan.count > 0 ? `Set the rules to ${season.season}'s` : eraPlan.skipped.length ? 'Nothing else to change' : `Nothing to change: this ROM plays ${season.season}'s rules`}
                </button>
              </p>
            </>
          )}
          {era && !eraPlan && <p className="note">This ROM takes no hacks, so its rules cannot be set here.</p>}
          {rulesNote && <p>{rulesNote}</p>}
          <h3>The players</h3>
          <p>
            <label>
              Show{' '}
              <select aria-label="Season team to show" value={shown} onChange={(e) => setShown(Number(e.target.value))}>
                {season.teams.map((t, s) => (
                  <option key={s} value={s}>
                    {t.location} {t.name}
                  </option>
                ))}
              </select>
            </label>
          </p>
          {view && (
            <table className="season-players">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>#</th>
                  <th>Season</th>
                  <th>Overall</th>
                </tr>
              </thead>
              <tbody>
                {view.players.map((p, i) => (
                  <tr key={i}>
                    <td>{p.player.name}</td>
                    <td>{p.player.jersey ? p.player.jersey.toString(16) : ''}</td>
                    <td>{p.line}</td>
                    <td>{overallRating(p.player.attributes, p.isGoalie, project.game)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="note">
            Speed, Agility and Checking are the least sure: no stat measures them, so they come from what goes with them
            (games, points, shots, age, size). Change any player on their team's page afterwards. Stats: the NHL's public
            stats service.
          </p>
        </>
      )}
    </main>
  )
}
