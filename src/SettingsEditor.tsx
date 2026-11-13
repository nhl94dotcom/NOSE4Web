import { useState, type ReactNode } from 'react'
import { readClipboard, writeClipboard } from './clipboard'
import { copyDraws, pasteDraws } from './core/clipboard'
import type { GameConfig } from './core/games'
import { CREDITS_LINE_LENGTH, CREDITS_PAGE_LINES, creditsFit, creditsText, creditsUsed } from './core/credits'
import { SNES_CREDITS_LINE_LENGTH, SNES_CREDITS_PAGE_LINES, snesCreditsText } from './core/snescredits'
import { isAllStarTeam } from './core/league'
import { FEWEST_MENU_TEAMS, leagueDraws } from './core/menuteams'
import { MAX_SECONDS, menuOptions, type FixedText, type Settings } from './core/settings'
import { resetSettingsPart, settingsPartChanged } from './core/reset'
import { ResetButton } from './ResetButton'

function cleanText(text: string): string {
  return text.replace(/[^\x20-\x7d]/g, '')
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

interface Props {
  game: GameConfig
  settings: Settings
  // The settings as they are in the ROM that was opened.
  original: Settings
  teamNames: string[]
  onChange: (settings: Settings) => void
  // Sections that come right after the main menu's starting choices and the clock (the announcer, the matchup text).
  first?: ReactNode
  // More sections for the page, at its end, such as the splash screen.
  children?: ReactNode
}

export function SettingsEditor({ game, settings, original, teamNames, onChange, first, children }: Props) {
  // Playoff draws ticked for copying and pasting.
  const [ticked, setTicked] = useState<number[]>([])
  const [notice, setNotice] = useState('')

  async function copyTicked() {
    await writeClipboard(copyDraws(settings.playoffDraws, ticked))
    setNotice(`Copied ${ticked.length === 1 ? '1 draw' : `${ticked.length} draws`}.`)
  }

  async function pasteOverTicked() {
    try {
      const playoffDraws = pasteDraws(settings.playoffDraws, ticked, await readClipboard(), teamNames.length)
      onChange({ ...settings, playoffDraws })
      setNotice('Pasted.')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    }
  }

  function replace<T>(list: T[], index: number, value: T): T[] {
    return list.map((v, i) => (i === index ? value : v))
  }

  function textInput<T extends FixedText>(value: T, onText: (next: T) => void) {
    return (
      <input
        value={value.text}
        maxLength={value.maxLength}
        size={value.maxLength}
        onChange={(e) => onText({ ...value, text: cleanText(e.target.value) })}
      />
    )
  }

  function secondsInput(seconds: number, onSeconds: (next: number) => void) {
    return (
      <>
        <input
          className="seconds"
          type="number"
          min={0}
          max={MAX_SECONDS}
          value={seconds}
          onChange={(e) => onSeconds(Math.min(MAX_SECONDS, Math.max(0, Math.floor(Number(e.target.value)) || 0)))}
        />{' '}
        <span className="note">{clock(seconds)}</span>
      </>
    )
  }

  function byteInput(value: number, onValue: (next: number) => void) {
    return (
      <input
        className="seconds"
        type="number"
        min={0}
        max={255}
        value={value}
        onChange={(e) => onValue(Math.min(255, Math.max(0, Math.floor(Number(e.target.value)) || 0)))}
      />
    )
  }

  // Fewer teams in the menu: a team line that starts on a team no longer offered starts on the last one.
  function setTeamsInMenu(offered: number) {
    const menu = settings.menu.map((item, i) => (game.menuTeamItems.includes(i) && item.value >= offered ? { ...item, value: offered - 1 } : item))
    onChange({ ...settings, menu, menuTeams: { offered } })
  }

  // The teams the league's playoff draws are made of: those the menu offers, less the All-Stars.
  const offered = settings.menuTeams?.offered ?? teamNames.length
  const leagueTeams = teamNames.slice(0, offered).flatMap((name, t) => (isAllStarTeam(name) ? [] : [t]))
  const slots = settings.playoffDraws[0]?.length ?? 0
  const canFillDraws = settings.menuTeams !== null && offered < teamNames.length && slots > 0 && leagueTeams.length >= slots

  function fillDraws() {
    onChange({ ...settings, playoffDraws: leagueDraws(leagueTeams, settings.playoffDraws.length, slots) })
    setNotice(`Every draw now has only the first ${leagueTeams.length} teams.`)
  }

  const duplicateDraws = settings.playoffDraws
    .map((draw, i) => (new Set(draw).size < draw.length ? i + 1 : 0))
    .filter((n) => n > 0)

  return (
    <main className="team">
      <section>
        <h2>Main menu starting choices</h2>
        <p>
          <ResetButton
            what="starting choices"
            changed={settingsPartChanged(settings, original, 'menu')}
            onReset={() => onChange(resetSettingsPart(settings, original, 'menu'))}
          />
        </p>
        {settings.menuTeams && (
          <p>
            <label>
              Teams in the menu{' '}
              <input
                className="seconds"
                type="number"
                min={FEWEST_MENU_TEAMS}
                max={teamNames.length}
                value={settings.menuTeams.offered}
                onChange={(e) =>
                  setTeamsInMenu(Math.min(teamNames.length, Math.max(FEWEST_MENU_TEAMS, Math.floor(Number(e.target.value)) || FEWEST_MENU_TEAMS)))
                }
              />
            </label>{' '}
            <span className="note">
              of {teamNames.length}. The menu offers only the first so many teams in the team list, for a league smaller
              than the ROM: put the league's teams first. The teams after them stay in the ROM. The demo and new playoffs
              keep to these teams too, and with 18 or more so do the other scores of the day.
            </span>
          </p>
        )}
        <table className="left">
          <tbody>
            {settings.menu.map((item, i) => {
              const all = menuOptions(settings, game, i, teamNames)
              // A team line offers only the teams in the menu, and the team it starts on.
              const teamLine = game.menuTeamItems.includes(i)
              const options = teamLine ? all.slice(0, offered) : all
              const past = teamLine && item.value >= offered && item.value < all.length
              return (
                <tr key={i}>
                  <td>{item.caption}</td>
                  <td>
                    <select
                      className="wide"
                      value={item.value}
                      onChange={(e) =>
                        onChange({ ...settings, menu: replace(settings.menu, i, { ...item, value: Number(e.target.value) }) })
                      }
                    >
                      {past && <option value={item.value}>{all[item.value]} (not offered)</option>}
                      {!past && item.value >= options.length && <option value={item.value}>Invalid ({item.value})</option>}
                      {options.map((option, o) => (
                        <option key={o} value={o}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {game.platform === 'snes' && (
          <p className="note">
            The choice each line of the Game Setup menu starts on when the game is switched on. In the playoff modes
            the game shows the Home line as Team, and hides the Visitor line.
          </p>
        )}
      </section>

      {settings.periodLengths.length > 0 && (
        <section>
          <h2>Clock</h2>
          <p className="note">
            Each period length the main menu offers can be any time you like, up to 99:59: type it in seconds (7
            minutes is 420, 8 is 480), and the time it makes shows beside the box. Change its menu text to match,
            such as <i>7 Minutes</i>, so the menu says what the game plays.
          </p>
          <p>
            <ResetButton
              what="clock settings"
              changed={settingsPartChanged(settings, original, 'clock')}
              onReset={() => onChange(resetSettingsPart(settings, original, 'clock'))}
            />
          </p>
          <table className="left">
            <thead>
              <tr>
                <th />
                <th>Seconds</th>
                <th>Menu text</th>
              </tr>
            </thead>
            <tbody>
              {settings.periodLengths.map((period, i) => (
                <tr key={i}>
                  <td>
                    {i < 3
                      ? `Period length, choice ${i + 1}`
                      : game.platform === 'snes'
                        ? 'Period length, fourth (offered by the 30-second periods hack)'
                        : 'Period length, fourth entry'}
                  </td>
                  <td>
                    {secondsInput(period.seconds, (seconds) =>
                      onChange({ ...settings, periodLengths: replace(settings.periodLengths, i, { ...period, seconds }) }),
                    )}
                  </td>
                  <td>
                    {textInput(period, (next) =>
                      onChange({ ...settings, periodLengths: replace(settings.periodLengths, i, next) }),
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td>Overtime</td>
                <td>{secondsInput(settings.overtimeSeconds, (overtimeSeconds) => onChange({ ...settings, overtimeSeconds }))}</td>
                <td />
              </tr>
              <tr>
                <td>Shootout (penalty shot)</td>
                <td>{secondsInput(settings.shootoutSeconds, (shootoutSeconds) => onChange({ ...settings, shootoutSeconds }))}</td>
                <td />
              </tr>
            </tbody>
          </table>
          <p className="note">
            The menu text does not update itself when you change the seconds.
            {game.platform === 'snes' && ' The SNES game plays overtime this long in the regular season; in the playoffs an overtime period is as long as the others.'}
          </p>
          {settings.cpuPullGoalie && (
            <>
              <h3>Computer pulls its goalie</h3>
              <p>
                In the third period, when behind by 1 to{' '}
                <input
                  className="seconds"
                  type="number"
                  aria-label="Most goals behind to pull the goalie"
                  min={0}
                  max={20}
                  value={settings.cpuPullGoalie.goalsUnder - 1}
                  onChange={(e) => {
                    const goals = Math.min(20, Math.max(0, Math.floor(Number(e.target.value)) || 0))
                    onChange({ ...settings, cpuPullGoalie: { ...settings.cpuPullGoalie!, goalsUnder: goals + 1 } })
                  }}
                />{' '}
                goals, with{' '}
                {secondsInput(Math.max(0, settings.cpuPullGoalie.secondsUnder - 1), (seconds) =>
                  onChange({ ...settings, cpuPullGoalie: { ...settings.cpuPullGoalie!, secondsUnder: seconds + 1 } }),
                )}{' '}
                seconds or less left.
              </p>
              <p className="note">
                A team the computer controls pulls its goalie for an extra attacker then, while it carries the puck in its
                attacking half. The original
                game does it behind by 1 or 2 goals with 60 seconds or less left. 0 goals means never. These are the two numbers
                NHL94SNESVault's CPU pull goalie setting changes.
              </p>
            </>
          )}
        </section>
      )}

      {first}

      {settings.credits && <CreditsSection settings={settings} original={original} onChange={onChange} />}

      {settings.rules.length > 0 && (
        <section>
          <h2>Rule messages</h2>
          <p>
            <ResetButton
              what="rule messages"
              changed={settingsPartChanged(settings, original, 'rules')}
              onReset={() => onChange(resetSettingsPart(settings, original, 'rules'))}
            />
          </p>
          <table className="left">
            <thead>
              <tr>
                <th>Message</th>
                <th>Fade-out delay</th>
                <th>Penalty minutes</th>
              </tr>
            </thead>
            <tbody>
              {settings.rules.map((rule, i) => (
                <tr key={rule.offset}>
                  <td>{textInput(rule, (next) => onChange({ ...settings, rules: replace(settings.rules, i, next) }))}</td>
                  <td>
                    {byteInput(rule.delay, (delay) =>
                      onChange({ ...settings, rules: replace(settings.rules, i, { ...rule, delay }) }),
                    )}
                  </td>
                  <td>
                    {byteInput(rule.penaltyMinutes, (penaltyMinutes) =>
                      onChange({ ...settings, rules: replace(settings.rules, i, { ...rule, penaltyMinutes }) }),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">
            Several messages appear more than once because the game keeps separate copies for different situations.
          </p>
        </section>
      )}

      {settings.playoffDraws.length > 0 && (
        <section>
          <h2>Playoff draws</h2>
          <p className="note">
            The game picks one of these {settings.playoffDraws.length} draws when a new playoff starts.
            {duplicateDraws.length > 0 && (
              <span className="error"> A team appears twice in draw {duplicateDraws.join(', ')}.</span>
            )}
          </p>
          <p>
            <button disabled={ticked.length === 0} onClick={() => void copyTicked()}>
              Copy ticked
            </button>{' '}
            <button disabled={ticked.length === 0} onClick={() => void pasteOverTicked()}>
              Paste over ticked
            </button>{' '}
            {canFillDraws && (
              <>
                <button onClick={fillDraws} title={`Make ${settings.playoffDraws.length} new draws from the teams in the menu, each team in at least one`}>
                  Fill the draws with the league's teams
                </button>{' '}
              </>
            )}
            <ResetButton
              what="playoff draws"
              changed={settingsPartChanged(settings, original, 'playoffDraws')}
              onReset={() => onChange(resetSettingsPart(settings, original, 'playoffDraws'))}
            />{' '}
            <span className="note">{notice}</span>
          </p>
          <table>
            <thead>
              <tr>
                <th />
                <th>#</th>
                {game.playoffSlotLabels.map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {settings.playoffDraws.map((draw, d) => (
                <tr key={d}>
                  <td>
                    <input
                      type="checkbox"
                      title="Select for copy and paste"
                      checked={ticked.includes(d)}
                      onChange={(e) =>
                        setTicked(e.target.checked ? [...ticked, d].sort((a, b) => a - b) : ticked.filter((i) => i !== d))
                      }
                    />
                  </td>
                  <td>{d + 1}</td>
                  {draw.map((team, slot) => (
                    <td key={slot}>
                      <select
                        className="narrow"
                        value={team}
                        onChange={(e) =>
                          onChange({
                            ...settings,
                            playoffDraws: replace(settings.playoffDraws, d, replace(draw, slot, Number(e.target.value))),
                          })
                        }
                      >
                        {team >= teamNames.length && <option value={team}>Invalid ({team})</option>}
                        {teamNames.map((name, t) => (
                          <option key={t} value={t}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {children}
    </main>
  )
}

// The credits rolled on the title screen, a box of lines for each page.
function CreditsSection({ settings, original, onChange }: { settings: Settings; original: Settings; onChange: (settings: Settings) => void }) {
  const credits = settings.credits!
  const snes = credits.format === 'snes'
  const lineLength = snes ? SNES_CREDITS_LINE_LENGTH : CREDITS_LINE_LENGTH
  const pageLines = snes ? SNES_CREDITS_PAGE_LINES : CREDITS_PAGE_LINES
  const textOk = snes ? snesCreditsText : creditsText
  const used = creditsUsed(credits)
  const setPages = (pages: string[][]) => onChange({ ...settings, credits: { ...credits, pages } })
  // Only the letters the game has: on the SNES, capitals (lower case shows as them), digits, space, "." and "@".
  const clean = (line: string) => (snes ? line.toUpperCase().replace(/[^A-Z0-9 .@]/g, '') : line.replace(/[^\x20-\x7e]/g, ''))
  const setPage = (p: number, text: string) => setPages(credits.pages.map((page, i) => (i === p ? text.split('\n').map(clean) : page)))
  const fits = creditsFit(credits)
  const nameless = snes && credits.pages.some((page) => page.length < 2)
  return (
    <section>
      <h2>Title screen credits</h2>
      <p>
        <ResetButton what="credits" changed={settingsPartChanged(settings, original, 'credits')} onReset={() => onChange(resetSettingsPart(settings, original, 'credits'))} />{' '}
        <span className={fits ? 'note' : 'error'}>
          {used} of {credits.room} bytes used.
          {nameless ? ' Every title needs a name under it: the credits are not written until each has one.' : fits ? '' : ' Too long: the credits are not written until they fit.'}
        </span>
      </p>
      {snes ? (
        <p className="note">
          The credits roll one title at a time on the title screen: the title with its first name, then each of its other names in turn. A box is one
          title: its first line is the title and the lines after it are its names, at least one. The original game has up to {SNES_CREDITS_PAGE_LINES - 1}{' '}
          names under a title and lines of up to {SNES_CREDITS_LINE_LENGTH} letters, centred by the game. The game has capital letters, digits, spaces,{' '}
          <b>.</b> and <b>@</b>, which shows as the copyright sign. The same line twice takes its bytes once. The two copyright lines under the title are
          not changed. The title screen lasts the same time however long the credits are (4,740 frames from their start), and the original's
          titles fill nearly all of it: with fewer, the title screen waits with no credits before it goes to the menus (with 5 titles, about a
          minute).
        </p>
      ) : (
        <p className="note">
          The credits roll page by page on the title screen, each page held for a moment. A page has up to {CREDITS_PAGE_LINES} lines of up to{' '}
          {CREDITS_LINE_LENGTH} letters, centred by the game; an empty line is a gap. <b>$</b> shows as the copyright sign. The first page is EA's
          copyright notice: smozoma's guide to the credits warns that changing it can cause trouble, though league ROMs have changed it.
        </p>
      )}
      <ol className="credits">
        {credits.pages.map((page, p) => {
          const long = page.some((line) => line.length > lineLength || !textOk(line)) || page.length > pageLines
          return (
            <li key={p}>
              <textarea
                aria-label={snes ? `Credits title ${p + 1}` : `Credits page ${p + 1}`}
                className={long || (snes && page.length < 2) ? 'shared' : undefined}
                rows={snes ? Math.max(3, page.length) : CREDITS_PAGE_LINES}
                cols={lineLength + 2}
                value={page.join('\n')}
                onChange={(e) => setPage(p, e.target.value)}
              />{' '}
              <button
                title={snes ? 'Add a title after this one' : 'Add a page after this one'}
                onClick={() => setPages([...credits.pages.slice(0, p + 1), snes ? ['TITLE', 'NAME'] : [''], ...credits.pages.slice(p + 1)])}
              >
                {snes ? 'Add title' : 'Add page'}
              </button>{' '}
              <button
                disabled={credits.pages.length <= 1}
                title={snes ? 'Remove this title and its names' : 'Remove this page'}
                onClick={() => setPages(credits.pages.filter((_, i) => i !== p))}
              >
                Remove
              </button>
              {long && (
                <span className="note">
                  {' '}
                  More than the original game's {pageLines} lines of {lineLength} letters: check it on the screen.
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
