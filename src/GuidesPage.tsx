import { NHL94 } from './core/games'
import { LEAD_WEIGHT, TOP_SCORE, WEIGHTS } from './core/seasonbuilder'

// Walkthroughs: common jobs step by step, in the order that works, for commissioners new to the editor, and what
// happens if a step is left out. The Help page says what each page does; this one says which pages to use, in what
// order, to get a job done. The questions are on their own page (FaqPage.tsx). The labels quoted are the pages' own:
// keep them in step when a page changes. The ratings method is read from seasonbuilder.ts's own tables, so it stays
// in step with the code.

const CONTENTS: [string, string][] = [
  ['first', 'Your first edit, start to finish'],
  ['copy', "Copy one player's ratings onto another"],
  ['moves', 'Move, trade and release players'],
  ['lines', 'Lines'],
  ['hacks', 'Bug fixes and game options (Hacks)'],
  ['looks', 'Team names, colours and logos'],
  ['before', 'Before a season starts: check and compare'],
  ['newseason', 'From one league season to the next'],
  ['save', 'Saving work, and picking it up later'],
  ['sheets', 'Rosters in a spreadsheet'],
  ['season', 'A bigger job: a ROM of a real NHL season (1987-88)'],
  ['ratings', 'How Real NHL season rates players'],
]

// What each stat in the ratings tables is.
const STATS: Record<string, string> = {
  gp: 'games',
  g: 'goals',
  a: 'assists',
  shots: 'shots',
  shpct: 'shooting percentage',
  pim: 'penalty minutes',
  pm: 'plus-minus',
  ppg: 'power-play goals',
  shg: 'short-handed goals',
  svp: 'save percentage',
  gaa: 'goals against average',
  wp: 'share of decisions won',
  so: 'shutouts',
  h: 'height',
  w: 'weight',
  age: 'age',
}
const SKATER_STATS = ['gp', 'g', 'a', 'shots', 'shpct', 'pim', 'pm', 'ppg', 'shg', 'h', 'w', 'age']
const GOALIE_STATS = ['gp', 'svp', 'gaa', 'wp', 'so', 'h', 'w', 'age']

const attributeName = (label: string, goalie: boolean) => {
  if (label === 'Fgt') return 'Fighting'
  const labels = goalie ? NHL94.goalieAttributeLabels : NHL94.playerAttributeLabels
  const names = goalie ? NHL94.goalieAttributeNames : NHL94.playerAttributeNames
  return names[labels.indexOf(label)] ?? label
}

// The stats an attribute rests on most: its biggest weights, as "+ goals" or "− penalty minutes".
function restsOn(weights: Record<string, number | number[]>, stats: string[]): string {
  const top = stats
    .filter((k) => typeof weights[k] === 'number' && Math.abs(weights[k] as number) >= 0.3)
    .sort((a, b) => Math.abs(weights[b] as number) - Math.abs(weights[a] as number))
    .slice(0, 3)
  return top.map((k) => `${(weights[k] as number) > 0 ? '+' : '−'} ${STATS[k]}`).join(', ')
}

// The share of the original game's players with each value, in per cent: "1: 9%, 2: 30%, �"; the top is the last.
function shares(count: number[]): string {
  const total = count.reduce((s, n) => s + n, 0)
  return count.map((n, value) => `${value}: ${Math.round((100 * n) / total)}%`).join(', ')
}

// Measured against EA's own ratings in the original NHL 94 (531 players found by name in 1992-93): the share within
// one step, and the share exactly the same, in per cent. tests/seasonbuilder.test.ts keeps them from falling.
const MATCHED: [string, number, number][] = [
  ['Offensive Awareness', 100, 85],
  ['Aggression', 100, 86],
  ['Shot Accuracy', 99, 80],
  ['Roughness', 98, 67],
  ['Stick Handling', 96, 54],
  ['Endurance', 96, 50],
  ['Pass Accuracy', 96, 48],
  ['Speed', 95, 55],
  ['Defensive Awareness', 94, 50],
  ['Shot Power', 94, 54],
  ['Agility', 91, 48],
  ['Checking', 90, 40],
  ['Goalies: Offensive and Defensive Awareness', 100, 67],
  ['Goalies: Agility', 98, 58],
  ['Goalies: Puck Control', 95, 58],
]

const GROUPS: { group: 'F' | 'D' | 'G'; title: string; goalie: boolean }[] = [
  { group: 'F', title: 'Forwards', goalie: false },
  { group: 'D', title: 'Defencemen', goalie: false },
  { group: 'G', title: 'Goalies', goalie: true },
]

// A goalie's Offensive and Defensive Awareness share one set of weights: shown once.
const shownWeights = (group: 'F' | 'D' | 'G') => Object.entries(WEIGHTS[group]).filter(([label]) => !(group === 'G' && label === 'DfA'))
const shownName = (label: string, goalie: boolean) => (goalie && label === 'OfA' ? 'Offensive and Defensive Awareness' : attributeName(label, goalie))

function WeightTable({ group, goalie }: { group: 'F' | 'D' | 'G'; goalie: boolean }) {
  const stats = goalie ? GOALIE_STATS : SKATER_STATS
  return (
    <table className="season-players">
      <thead>
        <tr>
          <th>Attribute</th>
          <th>Start</th>
          {stats.map((k) => (
            <th key={k}>{STATS[k]}</th>
          ))}
          <th>Top rating from</th>
        </tr>
      </thead>
      <tbody>
        {shownWeights(group).map(([label, w]) => (
          <tr key={label}>
            <td>{shownName(label, goalie)}</td>
            <td>{w.c}</td>
            {stats.map((k) => (
              <td key={k}>{typeof w[k] === 'number' ? (w[k] as number) : 0}</td>
            ))}
            <td>{TOP_SCORE[group][label]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function GuidesPage() {
  return (
    <main className="team help" data-no-tabs>
      <h2>Walkthroughs</h2>
      <p className="note">
        Common jobs, step by step, in the order that works, and what happens if you leave a step out. Help says what
        each page does; here is which pages to use, and when. Names in bold are the editor's own buttons and pages.
        Questions and answers are on the FAQ page.
      </p>
      <ul className="contents">
        {CONTENTS.map(([id, title]) => (
          <li key={id}>
            <a href={`#guide-${id}`}>{title}</a>
          </li>
        ))}
      </ul>

      <h3 id="guide-first">Your first edit, start to finish</h3>
      <ol>
        <li>
          Keep a copy of the ROM you start from. The editor never changes your file: it works on a copy in this browser
          tab, and you download the result. If you save the download over the original, the original is gone.
        </li>
        <li>
          Choose <b>Open ROM…</b> and pick the ROM (Genesis .bin or .smd, SNES .smc or .sfc). Nothing is uploaded.
        </li>
        <li>
          In the <b>Name</b> box at the top, type a name for the new ROM, such as <i>Season_12</i>. The download takes
          this name. Leave it, and the download has the same name as the ROM you opened, which is easy to mix up with
          it.
        </li>
        <li>
          Pick a team under <b>Teams</b>. On its page, change a player's name, number or ratings in the table. Ratings
          show as 0 to 6 at first. <b>Show attributes as</b> can show them instead as the ranges the game's own screens
          show (25-29 to 99), or as the values stored in the ROM (0-15). This changes only how they show, not the
          ratings.
        </li>
        <li>
          Made a mistake? <b>Undo</b> (Ctrl+Z) and <b>Redo</b> (Ctrl+Y) at the top work across every page.
        </li>
        <li>
          Look at <b>Check ROM</b> under Review. A number beside it means problems to fix before playing. Skip it, and
          a problem it would have found shows up in the game instead.
        </li>
        <li>
          Choose <b>Download ROM</b>. Until you do, your changes are only in the editor. (<b>Download patch</b> gives an
          .ips patch of your changes instead, for players who have the original ROM.)
        </li>
      </ol>

      <h3 id="guide-copy">Copy one player's ratings onto another</h3>
      <ol>
        <li>
          From the <b>League</b> page: type part of the name in <b>Find a player</b>, tick the player in the{' '}
          <b>Copy</b> column, and choose <b>Copy the ticked player</b>. Ticks stay as you search for others, so you can
          copy several players together.
        </li>
        <li>
          Or from a team's page: tick the player and choose <b>Copy selected</b>.
        </li>
        <li>
          On the team page of the player to change, tick them and choose <b>Paste attributes only</b>. They keep their
          name and number. (<b>Paste over selected</b> brings the whole player, name and number too.)
        </li>
      </ol>
      <p className="note">Goalies paste only over goalies, and skaters over skaters.</p>

      <h3 id="guide-moves">Move, trade and release players</h3>
      <ul>
        <li>
          <b>One team to another:</b> on the team's page, tick the players and use <b>Move selected to</b>. Or on the
          League page, find the player and choose a team under <b>Move to</b>.
        </li>
        <li>
          <b>A trade:</b> on <b>Trade</b>, choose the two teams and tick the players each side gives up. Read{' '}
          <b>What it would do</b> (roster limits, and the lines that will need a look), then choose{' '}
          <b>Make this trade</b>. Goalies can be part of it.
        </li>
        <li>
          <b>Free agents:</b> <b>Release selected</b> on a team's page lets players go. They wait as free agents (the
          Trade page shows how many) until you sign them with <b>Sign</b>. Free agents are kept in this browser and in
          a project file, not in the ROM: see Saving work, below.
        </li>
        <li>After any of these, fix the lines (next). If you don't, a line can keep a place for a player who has gone.</li>
      </ul>

      <h3 id="guide-lines">Lines</h3>
      <ul>
        <li>
          On a team's page, <b>Lines</b>: <b>Build all lines</b> makes every line from the roster's ratings.{' '}
          <b>Fix broken lines</b> fills only the places left empty or held by a player who has gone, and leaves the rest
          as you set them.
        </li>
        <li>
          Every team at once: <b>Bulk changes</b>, then <b>Build every team's lines</b> or <b>Fix broken lines only</b>.
        </li>
        <li>
          Skip it after trades and moves, and Check ROM lists each line with a place no valid player holds, as a
          problem to fix before playing.
        </li>
      </ul>

      <h3 id="guide-hacks">Bug fixes and game options (Hacks)</h3>
      <ol>
        <li>
          Open <b>Hacks</b>. <b>Turn on the recommended fixes</b> picks the bug fixes most leagues use.
        </li>
        <li>Change any options you like. Nothing in the ROM changes yet: a bar says how many changes are waiting.</li>
        <li>
          Choose <b>Apply</b>. Until you do, the ROM plays as before. If you leave the page without applying, the
          editor keeps your choices and reminds you, and <b>Download ROM</b> asks before leaving them out.
        </li>
      </ol>
      <p className="note">Each option says whether the NHL94 Match Viewer project has tested it in the game.</p>

      <h3 id="guide-looks">Team names, colours and logos</h3>
      <ul>
        <li>
          On a team's page: <b>Location</b>, <b>Initials</b>, <b>Name</b> and <b>Stadium</b>; the <b>Colours</b> for
          home and away; and <b>Logos and banners</b>, to draw or to import a picture file.
        </li>
        <li>
          Many teams at once: <b>Import a team</b> brings names, rosters, colours, logos and banners from another ROM,
          one team or every team. <b>Picture files</b> exports every picture to a .zip and imports them back, to edit
          in a paint program.
        </li>
      </ul>

      <h3 id="guide-before">Before a season starts: check and compare</h3>
      <ol>
        <li>
          <b>Check ROM</b> lists problems (things that can go wrong in the game), broken league rules, and notes. On
          that page, <b>Your league's rules</b> sets limits such as the highest a player can be rated. Without those
          rules, Check ROM still finds problems, but not players over your league's limits.
        </li>
        <li>
          <b>Compare ROMs</b>: choose <b>Compare with a ROM…</b> and pick last season's ROM to see every change. Choose{' '}
          <b>Download report</b> for a text file to post for the league.
        </li>
      </ol>

      <h3 id="guide-newseason">From one league season to the next</h3>
      <ol>
        <li>Open last season's ROM (or its project file, on Project file).</li>
        <li>
          On <b>New season</b>, start the new season. It names the work after the new season and can first save a
          project file of the season just ended. Skip it, and the Changes page keeps counting from the start of the
          last season (or from when you opened the ROM), so its report can mix two seasons.
        </li>
        <li>
          Make the season's changes: trades, ratings, rookies. For rookies, tick new players on a team's page and use{' '}
          <b>Make up attributes</b>, then <b>Make</b>, for believable ratings of the kind and level you choose.
        </li>
        <li>
          <b>Changes</b> lists everything changed since the season began, however often you close the editor in
          between. Download it as a report for the league.
        </li>
      </ol>

      <h3 id="guide-save">Saving work, and picking it up later</h3>
      <ul>
        <li>
          This browser keeps your work as you go. Open NOSE4Web again and choose <b>Continue editing</b>. Clearing the
          browser's site data, or moving to another browser or computer, loses it unless you saved a project file.
        </li>
        <li>
          For another computer, or to be safe: <b>Project file</b>, then <b>Save project file</b>. Later, open the same
          ROM and choose <b>Open a project file…</b>.
        </li>
        <li>
          The ROM itself: <b>Download ROM</b>. A downloaded ROM opens in the editor again with everything in it except
          the free agents and the season's starting point, which only this browser and a project file keep.
        </li>
      </ul>

      <h3 id="guide-sheets">Rosters in a spreadsheet</h3>
      <ol>
        <li>
          On <b>Spreadsheet files</b>, export the rosters as an Excel workbook or as CSV files.
        </li>
        <li>
          Edit them in Excel, Google Sheets or LibreOffice, keeping the columns as they are. If a column is moved or
          renamed, its values may not come back in.
        </li>
        <li>
          Import them back on the same page (<b>Import a workbook…</b> or <b>Import files…</b>), then open Check ROM.
        </li>
      </ol>
      <p className="note">
        The same page makes the league website's players file (<b>League website players file</b>).
      </p>

      <h3 id="guide-season">A bigger job: a ROM of a real NHL season (1987-88)</h3>
      <p>
        This one has more steps than the others. The aim: the 21 teams of 1987-88, with that season's players rated
        from their stats, its team names, its rules for tied games, and a menu and playoffs of those 21 teams only.
        Start from the original game: NHL 94 on the Genesis, or on the SNES the original or McMarkis's SA-1 build. Its
        32-team version has a place for every team of a recent season, where the others have 26. Each step is one
        Undo, so you can try things freely. Where a step can be left out, it says what you get without it.
      </p>
      <ol>
        <li>
          <b>Open the ROM</b> and type a name in the <b>Name</b> box, such as <i>NHL_1987-88</i>. Skip the name, and
          the download has the original ROM's name.
        </li>
        <li>
          Go to <b>Real NHL season</b> (under League administration) and choose <b>Season</b> 1987-88.
        </li>
        <li>
          Choose how many <b>Goalies</b>, <b>Forwards</b> and <b>Defence</b> each team gets. 2, 15 and 8, as the
          original game has, are already set. If the rosters do not fit in the ROM, the skaters with the fewest games
          are left out, and the list after says how many.
        </li>
        <li>
          Leave <b>Use that season's team names</b> ticked: the Dallas Stars become the Minnesota North Stars, and the
          initials become the NHL's (MNS). Untick it, and the teams keep the ROM's names: the 1987-88 North Stars play
          as the Dallas Stars.
        </li>
        <li>
          Tick <b>Fill the All-Star teams with that season's best players of each conference</b>, so the All-Star
          teams are 1987-88's best of the Wales and the Campbell. Skip it, and the All-Star teams keep the ROM's
          players: in the original game, the stars of 1992-93.
        </li>
        <li>
          Look over <b>Where each team goes</b>. Each 1987-88 team goes where the ROM has the same team or franchise:
          the North Stars where the Dallas Stars are, the Jets where Winnipeg is. The five teams that came later
          (Anaheim, Florida, Ottawa, San Jose and Tampa Bay) say <b>Keep as it is</b>. This is usually right as it is,
          so you can leave the list alone.
        </li>
        <li>
          Choose <b>Bring in 21 teams from 1987-88</b>. Each team gets the players with the most games for it, new
          lines, and team ratings from its goals for and against and its power play and penalty kill. The list after
          says what was done. This is the step that makes the season: without it, nothing changes.
        </li>
        <li>
          Under <b>That season's rules</b>, choose <b>Set the rules to 1987-88's</b>. In 1987-88 a tied game played an
          overtime and then ended in a tie. The original game already plays it that way, so on it the button says{' '}
          <i>Nothing to change</i>. A season from 2005-06 on gets the shootout, and from 2015-16 on, 3 on 3 overtime.
          Skip it for one of those seasons, and tied games end as the ROM has them: in the original game, in a tie,
          with no shootout.
        </li>
        <li>
          Under <b>Offer only these teams in the menu</b>, choose <b>Offer only the 21 teams of 1987-88 in the menu</b>.
          The 21 teams go to the top of the team list, and the main menu offers only them and the All-Star teams. New
          playoff draws are made of the 21 alone (16 of them make each playoff, as in 1987-88). The five later teams
          stay in the ROM after them, out of the menu. Skip it, and the menu still offers all 28 teams, with the five
          later teams and their original players among the 1987-88 teams, and the playoffs can draw those five too. (By
          hand, this step is <b>Move teams</b> on Bulk changes, then <b>Teams in the menu</b> and{' '}
          <b>Fill the draws with the league's teams</b> on Game settings, in that order.)
        </li>
        <li>
          On <b>Game settings</b>, set the <b>Overtime</b> length under Clock, in seconds. The NHL's overtime was 5
          minutes against 20-minute periods, a quarter of a period: 75 seconds for a league that plays 5-minute
          periods, 150 for 10, 300 for 20. If you change a period length there, change its menu text too. Skip it, and
          the overtime stays as the ROM has it: in the original game, 600 seconds on the Genesis and 300 on the SNES,
          whatever the period length.
        </li>
        <li>
          The looks. Names come with the season, but logos, colours and stadium names stay as the ROM had them. For
          all of 1987-88's looks at once, open a ROM that has them on <b>Import a team</b>, choose{' '}
          <b>Every team at once</b>, tick <b>Home and away colours</b> and <b>Logos, banners and banner colours</b>,
          and bring them in. Teams are matched by name, so the other ROM needs a team called Minnesota North Stars, and
          so on. To do one team at a time, use its page: <b>Colours</b>, <b>Logos and banners</b>, and the{' '}
          <b>Stadium</b> box for the arena. Skip it, and the teams wear the ROM's logos and colours: the North Stars
          play in the Dallas Stars' logo and colours.
        </li>
        <li>
          Open <b>Check ROM</b>. After the steps above it should find no problems; if it lists any, each says what to
          do. Skip it, and a problem it would have found shows up in the game instead.
        </li>
        <li>
          Choose <b>Download ROM</b>. On <b>Project file</b>, you can also <b>Save project file</b>, to keep the work
          in a file of its own, without the ROM. For this job the ROM keeps everything, so the project file is only a
          backup.
        </li>
      </ol>
      <p>
        Ratings only, keeping the ROM's teams: under <b>Re-rate the players this ROM has</b>, the same page gives every
        player it finds by name that season's ratings and leaves everything else alone. This suits a league whose
        rosters are already made up.
      </p>

      <h3 id="guide-ratings">How Real NHL season rates players</h3>
      <p>Real NHL season works out each player's ratings from their stats in that one season. The steps, in order:</p>
      <ol>
        <li>
          <b>Who is rated together.</b> Each team takes the goalies, forwards and defencemen with the most games for it.
          Every player chosen across the league is then rated among the others of their kind: forwards among forwards,
          defencemen among defencemen, goalies among goalies. A player traded during the season is rated on their whole
          season, every team added together.
        </li>
        <li>
          <b>The stats.</b> For skaters: goals, assists, shots, penalty minutes, plus-minus, power-play goals and
          short-handed goals, each per game; shooting percentage; games played; and height, weight and age. For
          goalies: save percentage, goals against average, share of decisions won, shutouts per game, games played,
          height, weight and age.
        </li>
        <li>
          <b>Few games count for less.</b> Each per-game stat counts as if the player had also played 20 average games,
          so 3 goals in 2 games does not make a sniper. In the same way, shooting percentage counts 3 more goals on 30
          more shots, save percentage 600 more shots at .880, and goals against average 20 more games at 3.50. Games
          played count only up to 70 per cent of the most anyone played, so a star who missed some games is not
          marked down.
        </li>
        <li>
          <b>Standings, not totals.</b> Each stat becomes where the player stands among their group that season, from
          0 (the lowest) to 1 (the highest). This is what lets every era be rated alike: 50 goals meant more in some
          seasons than in others, but the season's top scorer stands at the top either way.
        </li>
        <li>
          <b>A score for each attribute.</b> Each attribute's score is a starting number, plus each standing times its
          weight (the tables below). For example, a forward's Shot Accuracy rests almost entirely on shooting
          percentage, and Aggression on penalty minutes.
        </li>
        <li>
          <b>Scores become ratings.</b> The players are put in order of score and given the 0 to 6 ratings in the same
          proportions as the original NHL 94's players have them, the lowest scores the lowest ratings. For example, of
          the original game's forwards, about 9 per cent have Agility 1, 30 per cent 2, 28 per cent 3, 26 per cent 4, 7
          per cent 5 and 1 per cent 6. The top rating is 6 for most attributes; for a few, such as Checking, EA gave
          no one above 5, and that stays the top. There is one exception at the top: every player whose score reaches
          what earned the top rating in 1992-93 gets it, however many do that season. So a season with more standout
          players has more top ratings.
        </li>
        <li>
          <b>The season's leader.</b> The player who leads the season in the stat an attribute rests on most always
          gets the top rating for it: the assists leader for Pass Accuracy, for example. (This counts only where that stat's
          weight is {LEAD_WEIGHT} or more; games played never counts, as many players share the most.) Standings go by
          order, so without this, Wayne Gretzky's 163 assists in 1985-86 would stand only a little above the next
          player's.
        </li>
        <li>
          <b>Defencemen's offence.</b> EA rated no defenceman above 4 for Offensive Awareness, so the defencemen's own
          scale stops there. A defenceman is also rated among the forwards for it, and keeps the higher of the two:
          Paul Coffey's 138 points in 1985-86 earn a 5, and Bobby Orr's 102 assists in 1970-71, the most of any player,
          a 6.
        </li>
        <li>
          <b>A cap on overall.</b> No one comes out above the original game's best overall rating: 100 for a skater
          (Mario Lemieux), 98 for a goalie (Ed Belfour). A player who would has their highest ratings lowered one step
          at a time, the least earned first. Roughness and Aggression are never lowered, as they are not marks of
          quality.
        </li>
        <li>
          <b>The rest.</b> Weight comes from the player's weight in pounds, and shooting hand and a goalie's glove hand
          from the NHL's data. Fighting has a score of its own, from penalty minutes and weight mostly. Team ratings:
          Offence and Defence come from goals for and against a game, and from 1977-78 the power play and penalty kill
          from that season's percentages. The teams are put in order and given the values the ROM's own teams had, the
          best team the best value.
        </li>
        <li>
          <b>Players who made no roster</b> (for Re-rate): each is placed among the players who did, and gets the
          rating of the rostered player with the nearest score at or below theirs. This way nobody else's rating
          changes.
        </li>
      </ol>
      <h4>Where the weights come from</h4>
      <p>
        EA made the original NHL 94's ratings from the 1992-93 season. The weights were fitted so that 1992-93's stats
        give back EA's ratings as closely as they can, and then changed a little by hand: height and weight no longer
        count for Agility (the game already slows a heavy player), age counts a little against Agility and Speed, and
        age no longer counts for skills such as passing and shooting, where EA rated veterans higher.
      </p>
      <p>Given 1992-93's stats, the method gives back EA's own ratings this closely (531 players found in both by name):</p>
      <table className="season-players">
        <thead>
          <tr>
            <th>Attribute</th>
            <th>Within one step of EA's</th>
            <th>The same as EA's</th>
          </tr>
        </thead>
        <tbody>
          {MATCHED.map(([name, near, same]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{near}%</td>
              <td>{same}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        Checking, Agility and Speed match least well: no stat measures them, so they come from what goes with them,
        such as games, points, shots, age and size. You can change any player on their team's page afterwards.
      </p>
      <h4>What each attribute rests on most</h4>
      {GROUPS.map(({ group, title, goalie }) => (
        <div key={group}>
          <p>
            <b>{title}</b>
          </p>
          <ul>
            {shownWeights(group).map(([label, w]) => (
              <li key={label}>
                {shownName(label, goalie)}: {restsOn(w, goalie ? GOALIE_STATS : SKATER_STATS)}. The original game's
                players: {shares(w.count)}.
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="note">
        "+" means more of that stat raises the rating, and "−" means more of it lowers the rating. A goalie's goals
        against average is turned round first, so a lower average counts as more. Roughness is the game's shoot or pass
        bias, so it rests on shots against assists: a shooter rather than a passer.
      </p>
      <details>
        <summary>All the weights</summary>
        <p className="note">
          A score is the start, plus each weight times the player's standing in that stat (0 to 1). "Top rating from" is
          the score that earned the top rating in 1992-93: any player who reaches it gets that rating.
        </p>
        {GROUPS.map(({ group, title, goalie }) => (
          <div key={group} className="scroll">
            <p>
              <b>{title}</b>
            </p>
            <WeightTable group={group} goalie={goalie} />
          </div>
        ))}
      </details>
    </main>
  )
}
