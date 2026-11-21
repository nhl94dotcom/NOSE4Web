import { SUPPORTED_GAMES } from './core/games'
import { GENESIS_HACK_GROUPS, SNES_HACK_GROUPS } from './core/hackgroups'
import { HACK_TITLES } from './core/hacks'
import { NHL95_HACK_SECTIONS, NHL95_HACK_TITLES } from './core/nhl95hacks'
import { SNES_HACK_TITLES } from './core/sneshacks'

// What NOSE4Web can do, as a plain list: not how to do it (that is the Help page). The hacks are listed from the
// Hacks pages' own groups and titles, so they stay as the pages have them.

function HackList({ name, groups }: { name: string; groups: { id: string; title: string; hacks: string[] }[] }) {
  const count = groups.reduce((sum, group) => sum + group.hacks.length, 0)
  return (
    <details className="more">
      <summary>
        {name}: {count} hacks
      </summary>
      {groups.map((group) => (
        <div key={group.id}>
          <h4>{group.title}</h4>
          <ul className="features-hacks">
            {group.hacks.map((hack) => (
              <li key={hack}>{hack}</li>
            ))}
          </ul>
        </div>
      ))}
    </details>
  )
}

const titled = <Key extends string>(groups: { id: string; title: string; hacks: Key[] }[], titles: Record<Key, string>) =>
  groups.map((group) => ({ ...group, hacks: group.hacks.map((hack) => titles[hack]) }))

export function FeaturesPage() {
  return (
    <main className="team help features" data-no-tabs>
      <h2>Features list</h2>
      <p className="note">
        Everything NOSE4Web can do, in the order of the list of pages. For how to use each one, see Help.
      </p>

      <h3>Games and files</h3>
      <ul>
        <li>Opens {SUPPORTED_GAMES.join(', ')}, and league ROMs built on them.</li>
        <li>Runs in the browser. The ROM is read on your computer and never uploaded.</li>
        <li>Undo and Redo for every change.</li>
        <li>Keeps your work in the browser, to carry on later where you left off.</li>
        <li>Downloads the edited ROM, or an IPS patch of your changes.</li>
        <li>Makes more room for longer rosters when a ROM has none to spare.</li>
        <li>Reminds you of work set up but not finished, and asks before a download leaves it out.</li>
        <li>Works on a phone or tablet as well as a computer.</li>
      </ul>

      <h3>Teams</h3>
      <ul>
        <li>Team names: place, initials, name and stadium, and the SNES banner name.</li>
        <li>Team ratings (offence, defence, power play, penalty kill, home and away) and the overall the game shows.</li>
        <li>
          Rosters: add, delete and reorder players, and edit every name, number and attribute. Attributes show as
          the game shows them or as the numbers stored.
        </li>
        <li>Sort the roster, find a player by name, and choose the order of the attribute columns.</li>
        <li>Each player's overall rating, and Match Viewer's league value (LV) where the ROM has it.</li>
        <li>Copy and paste players between teams, or between two ROMs open in two tabs.</li>
        <li>Move players to another team, release them to the free agents, and sign free agents.</li>
        <li>
          Make up players: ten kinds of skater and four of goalie, at six levels or at random, with random names if
          you like.
        </li>
        <li>Quick edit keys, and moving round the tables with the keyboard as in a spreadsheet.</li>
        <li>A roster card: the roster as a picture to post.</li>
        <li>Lines: edit all eight, build them from the players' ratings, fix broken ones, and copy and paste them.</li>
        <li>Home and away colours, with previews of the players, and copying colours to another team.</li>
        <li>Logos and banners: export, import and draw them, centre ice logos included.</li>
        <li>Score logos: a small team logo beside each score during play.</li>
        <li>Player photos: replace, draw and import them.</li>
        <li>Each team's organ songs.</li>
        <li>Reset any part of a team, or the whole team, back to the ROM as opened.</li>
      </ul>

      <h3>Game</h3>
      <ul>
        <li>The main menu's starting choices and the clock.</li>
        <li>The playoff draws.</li>
        <li>Ron Barr's matchup screen text, the title screen credits and the rule messages.</li>
        <li>The announcer picture, the splash screen and the menu picture.</li>
        <li>Organ songs from your own MIDI files, and the game's other music: play, export and replace.</li>
        <li>Rink colours.</li>
        <li>
          Hacks that change how the game plays, each explained and marked as tested in the game or not. A button
          turns on the recommended fixes, another copies the hacks of another ROM, and a hack sheet lists a ROM's
          hacks to post for the league.
        </li>
      </ul>
      <HackList name="NHL 94 (Genesis)" groups={titled(GENESIS_HACK_GROUPS, HACK_TITLES)} />
      <HackList name="NHL '94 (SNES)" groups={titled(SNES_HACK_GROUPS, SNES_HACK_TITLES)} />
      <HackList name="NHL '95 (Genesis)" groups={titled(NHL95_HACK_SECTIONS, NHL95_HACK_TITLES)} />

      <h3>League administration</h3>
      <ul>
        <li>League: how the teams compare, two teams side by side, league balance, and finding any player.</li>
        <li>Trade: two sides, a preview of what the trade does, and free agents.</li>
        <li>
          Bulk changes: one attribute for many players at once, weights from another era, and for every team its
          shown overall, its home and away ratings, its lines and its place in the order of teams.
        </li>
        <li>Import a team from another ROM: its names, roster, colours, logos and photos.</li>
        <li>Logos and colours for every team at once from another ROM, matched by team name.</li>
        <li>Real NHL season: every team's players from any season since 1967-68, rated from that season's stats.</li>
        <li>New season: a starting point, so that Changes can list what has changed since.</li>
      </ul>

      <h3>Files</h3>
      <ul>
        <li>Spreadsheet files: the teams, players, lines and settings as an Excel workbook or CSV files, to edit and import again.</li>
        <li>The league website's players file.</li>
        <li>Picture files: every logo, banner and photo as PNG pictures in one zip file, to edit and import again.</li>
        <li>Project file: all your work, free agents and league rules included, to carry on elsewhere.</li>
      </ul>

      <h3>Review</h3>
      <ul>
        <li>Check ROM: what would cause trouble in the game, what breaks your league's own rules, and what is unusual.</li>
        <li>
          Your league's rules: how many players, goalies, forwards and defencemen a team has, and caps on players' and
          teams' ratings, salary-cap style, checked for every team.
        </li>
        <li>Changes: what has changed since the ROM was opened or since the season began, as a report to share.</li>
        <li>Compare ROMs: how two ROMs differ, team by team, as a report to share.</li>
      </ul>
    </main>
  )
}
