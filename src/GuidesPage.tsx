import { NHL94 } from './core/games'
import { MAX_ROSTER } from './core/roster'
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
  ['rookie', 'Add a new player from scratch'],
  ['lines', 'Lines'],
  ['hacks', 'Bug fixes and game options (Hacks)'],
  ['looks', 'Team names, colours and logos'],
  ['boards', 'Ads on the boards (NHL 94, Genesis)'],
  ['music', 'Change a song or the game music'],
  ['size', 'A league with fewer teams than the ROM'],
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

// The share of the original game's players with each value, in per cent: "1: 9%, 2: 30%, …"; the top is the last.
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
        <li>After any of these, fix the lines (below). If you don't, a line can keep a place for a player who has gone.</li>
      </ul>

      <h3 id="guide-rookie">Add a new player from scratch</h3>
      <p>Such as a rookie no ROM has yet.</p>
      <ol>
        <li>
          On the team's page, under Roster, choose <b>Add forward</b>, <b>Add defenceman</b> or <b>Add goalie</b>. The
          new player goes after the team's last player of that kind, named with their roster number, such as{' '}
          <i># 12</i>. The game goes by roster order, not by a player's own position, so choose the right button: to
          change it later, move the player on the roster and change <b>Forwards</b> on the Team tab. The buttons are
          greyed out when the team has {MAX_ROSTER} players (or 15 forwards, 15 defencemen or 4 goalies). Each new
          player takes 14 bytes of the ROM's room for names and players, plus their name: if the top of the page says
          the ROM is over the limit, see Help's <i>Space in the ROM</i>.
        </li>
        <li>Type their name and jersey number in the roster table.</li>
        <li>
          Give them ratings: tick them, and under <b>Make up attributes</b> choose the kind of player and the level,
          then <b>Make</b> (or <b>Random</b>). You can also set each rating by hand. Skip it, and every rating stays at
          0, at the lightest weight.
        </li>
        <li>
          Put them in the lines: on the Lines tab, choose them for a place, or choose <b>Build all lines</b> to build
          every line again from the roster. <b>Fix broken lines</b> leaves them out, as no place is broken. Skip it, and
          they never play: the game puts on the ice only the players in its lines.
        </li>
        <li>Open Check ROM.</li>
      </ol>

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
        <li>
          The rink: <b>Rink colours</b> changes the rink's colours and shows the whole rink as the game has it, the
          boards, benches, penalty boxes and crowd too (on the Genesis under <b>The whole rink</b>), and{' '}
          <b>Export as PNG</b> saves it. On NHL 94 for the Genesis, draw on the saved picture in a paint program, keeping
          to its size and its colours, and <b>Import a PNG</b> puts it back; do the same for the reverse angle replays'
          rink (<b>Rink</b>, above the picture). Repeat squares where you can: the rink has room for only so many
          different ones, and the page says if a picture needs more.
        </li>
      </ul>

      <h3 id="guide-boards">Ads on the boards (NHL 94, Genesis)</h3>
      <ol>
        <li>
          Open <b>Rink colours</b>. Under <b>The whole rink</b>, click <b>Export as PNG</b> (the picture to edit) and{' '}
          <b>Drawing guide</b> (a picture to keep beside it, not to import). The guide shows the 8 by 8 grid the rink is
          made of, with the boards, benches, penalty boxes and end glass bright and the rest dimmed. The red block at
          centre ice is the home team's logo; leave it alone.
        </li>
        <li>
          Open the export in a paint program and turn on a grid of 8 pixels from the top left corner. Draw the ads on
          the boards with the rink's own colours (pick them with the eyedropper), with the pencil tool and anti-aliasing
          off, so every pixel is a rink colour.
        </li>
        <li>
          Keep it cheap: the rink stores each different 8 by 8 square once, and the original rink leaves room for only
          about 20 more. Line the ads up with the grid, use flat colour, and repeat the same squares (the same ad again
          further along the boards costs nothing). A small logo of a few squares fits; a photo does not.
        </li>
        <li>
          Save as PNG at the same size and click <b>Import a PNG…</b>. If it says the picture needs too many squares, it
          names where the new ones are: simplify those, or click <b>Make it fit</b>, which swaps the least different
          squares for the closest ones the rink has and says how many pixels changed.
        </li>
        <li>
          Do the same for the reverse angle replays' rink (<b>Rink</b>, above the picture), or its replays show the boards
          without the ads. <b>Undo</b> or <b>Put back the original rink</b> takes it all back.
        </li>
      </ol>
      <p>
        Or draw them here: <b>Edit the rink…</b> opens the rink with the grid on, in the rink's own colours. Each stroke
        goes in as you draw, the page counts the squares, and a stroke that needs too many is refused. Draw one ad, then{' '}
        <b>Copy</b> it (drag a rectangle round it) and <b>Stamp</b> it along the boards: stamps snap to the squares, so
        the copies cost nothing.
      </p>
      <p className="note">
        Skip a step and: without the grid, an ad drawn across squares can need far more squares than it looks; with
        soft edges or new colours, nearly every square it touches becomes a new one; without the reverse rink, replays
        show the old boards.
      </p>

      <h3 id="guide-music">Change a song or the game music</h3>
      <p>
        The organ songs are the short tunes the organ plays at goals and stoppages; each team's page picks which ones it
        plays. The game music is the rest: the title and menu music, and on the Genesis the end of period and scouting
        report pieces, on the SNES the playoff music.
      </p>
      <ol>
        <li>
          Open the <b>Music</b> page. In <b>Organ songs</b>, <b>Used by</b> shows which teams play
          each song; one that no team uses is the safe one to replace first.
        </li>
        <li>
          <b>Play</b> to hear a piece, and <b>Export MIDI</b> to save it as a MIDI file.
        </li>
        <li>
          To put in a file of your own as it is: <b>Replace…</b> and pick the MIDI file. For the game music you then
          choose a game instrument for each of its parts, and <b>Put it in</b>.
        </li>
        <li>
          To change the notes: <b>Edit…</b>. The piece opens on a piano roll: time runs left to right, high notes at the
          top, each part in its own colour, and the drums on rows of their own at the bottom. To edit a file of your own
          first, choose <b>Open a MIDI file…</b> in the editor.
        </li>
        <li>
          Notes: click one to pick it, Shift-click to pick more, or drag a box round several. Drag picked notes to move
          them, or drag a note's right end to make it longer. Double-click an empty spot to add a note to the part ticked
          under <b>New notes</b>. Delete removes the picked notes; the up and down arrows move them a semitone (with
          Shift, an octave); left and right move them a step, the <b>Step</b> chosen (with Shift, longer or shorter).
          Ctrl+Z undoes and Ctrl+Y redoes.
        </li>
        <li>
          Parts and the whole piece: each part's row moves it down or up an octave or a semitone, makes it quieter or
          louder, picks all its notes, or deletes it. <b>Speed</b> makes the whole piece faster or slower, and{' '}
          <b>Keep from … to … seconds</b> cuts it to a stretch. Untick a part's <b>Shown</b> to hide it, and to hear the
          others without it.
        </li>
        <li>
          Red: a red band marks where more notes sound at once than go into the ROM; there the extra ones are left out
          or cut short. The links under the roll jump to the first few. The game's own pieces have some too.
        </li>
        <li>
          <b>Play</b> plays the piece as it would go in, the limits applied. On the SNES you hear the game's own
          instruments; on the Genesis a rough organ-like tone in the browser, so play the downloaded ROM in an emulator
          for the real sound.
        </li>
        <li>
          <b>Put it in</b> (an organ song) or <b>Choose the instruments</b> (game music: the instruments first chosen are
          the piece's own where the editor can tell them, and you can change each). <b>Save as MIDI</b> keeps your edit
          as a file, to finish later or in another music program. Undo takes a put-in piece back, and{' '}
          <b>Put back the original</b> brings back the game's own.
        </li>
      </ol>
      <p>
        A team's own song before its home games: <b>Pre-game songs</b>, below the game music, sets the matchup screen's
        music for each home team (on the Genesis).
      </p>
      <p>
        Things to know. Every organ note plays on the organ, drums left out, at most 4 at once (7 in NHL '95), each
        moved by octaves into the organ's range. On NHL '95 each game instrument plays one note at a time and one part,
        so chords in a part thin out. On the SNES, a game piece edited here goes back on its parts' own instruments and
        sides, at the game's usual loudness for each, its crash and other percussion played from the drum track. Short
        organ songs, 10 to 30 seconds, suit the game best.
      </p>

      <h3 id="guide-size">A league with fewer teams than the ROM</h3>
      <p>
        For a league of, say, 20 teams in a ROM with 26 places, so the menu and the playoffs have only the league's
        teams. The other teams stay in the ROM, after the league's.
      </p>
      <ol>
        <li>
          On <b>Bulk changes</b>, under <b>Move teams</b>, move the league's teams to the top of the team list with the
          arrows beside each team. Their players, lines, names, colours and logos move with them. Skip it, and a
          league team lower in the list than the number in the next step cannot be picked in the menu.
        </li>
        <li>
          On <b>Game settings</b>, set <b>Teams in the menu</b> to the number of teams to offer. Count any All-Star
          teams you want offered, and move them up to just after the league's teams. Skip it, and the menu offers
          every team in the ROM.
        </li>
        <li>
          Still on Game settings, under <b>Playoff draws</b>, choose <b>Fill the draws with the league's teams</b>. It
          makes new draws from the teams in the menu (not the All-Star teams), each team in at least one. It is offered when the league has at
          least as many teams as a draw holds (16 in the original game). Skip it, and a playoff can draw teams from
          outside the league.
        </li>
        <li>Open Check ROM.</li>
      </ol>
      <p className="note">
        The editor cannot add team places. For a bigger league, start from a ROM with more places, such as the 30-team
        ROM or the SNES SA-1 build's 32-team version. To change which teams the league has, rename a place on its
        team's page (see Team names, colours and logos, above). For a real NHL season, <b>Offer only these teams in
        the menu</b> on Real NHL season does all three steps at once.
      </p>

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

      <p>
        The season's schedule: on the <b>League</b> page, <b>Schedule maker</b> has the teams the menu offers ticked
        (untick any that sit out). Set how many times each pair meets; to have teams meet more often within a division,
        type a group name beside each (such as East and West) and set both numbers. <b>Mix again</b> shuffles the order;{' '}
        <b>Save as a spreadsheet</b> gives a CSV of the games, numbered, with the game day, home team and visitors.
      </p>

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
          On <b>Game settings</b>, set the <b>Overtime</b> length under Clock, in seconds. This is the regular
          season's overtime; in the playoffs, an overtime is as long as a period, as in the NHL. The NHL's regular-season
          overtime was 5 minutes against 20-minute periods, a quarter of a period: 75 seconds for a league that plays
          5-minute periods, 150 for 10, 300 for 20. If you change a period length there, change its menu text too. Skip
          it, and the regular season's overtime stays as the ROM has it: in the original game, 600 seconds on the
          Genesis and 300 on the SNES, whatever the period length.
        </li>
        <li>
          The looks. Names come with the season, but logos, colours and stadium names stay as the ROM had them. A team
          in another city's place, as the Minnesota North Stars in the Dallas Stars', gets its banners lettered with
          its city on NHL 94 for the Genesis; the notes after bringing the season in name any team still showing another
          city's banners or another team's logo. For
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
      <p>
        In short: each player is compared with the other players of that season, one stat at a time. Those comparisons
        are added up into a score for each rating, and the scores are turned into 0 to 6 ratings, so that the season has
        about as many 1s, 2s, 3s and so on as the original NHL 94 has. The details, step by step:
      </p>
      <ol>
        <li>
          <b>Who is compared with whom.</b> Each team gets the goalies, forwards and defencemen with the most games for
          it, as many as you chose. Forwards are then compared only with the other forwards across the league,
          defencemen with defencemen, and goalies with goalies. A player traded during the season counts with their
          whole season, all their teams added together.
        </li>
        <li>
          <b>The stats used.</b> For skaters: goals, assists, shots, penalty minutes, plus-minus, power-play goals and
          short-handed goals, each per game; shooting percentage; games played; and height, weight and age. For
          goalies: save percentage, goals against average, share of decisions won, shutouts per game, games played,
          height, weight and age.
        </li>
        <li>
          <b>Players with only a few games.</b> A player who played only a few games can have extreme numbers by luck,
          so each player's stats are first pulled toward the average, a lot for a few games and hardly at all for a
          full season:
          <ul>
            <li>
              Per-game stats (goals, assists, shots and so on): 20 games at the average for their group are added to
              the player's own. Say the forwards average 0.3 goals a game. A forward with 3 goals in 2 games (1.5 a
              game) counts as (3 + 20 × 0.3) ÷ (2 + 20), about 0.41 a game. One with 40 goals in 80 games (0.5 a game)
              counts as (40 + 6) ÷ (80 + 20), 0.46: almost their own.
            </li>
            <li>
              Shooting percentage: 3 goals on 30 shots are added. 2 goals on 4 shots (50 per cent) counts as 5 on 34,
              about 15 per cent; 40 goals on 250 shots (16 per cent) as 43 on 280, about 15.4 per cent.
            </li>
            <li>
              Goalies: 600 shots saved at .880 are added to the save percentage, and 20 games at 3.50 to the goals
              against average.
            </li>
            <li>
              Games played works differently: every number from 70 per cent of the most anyone played up counts the
              same. If the most is 80, then 56 games count as much as 80, so a star who missed some games through
              injury is not marked down for it.
            </li>
          </ul>
        </li>
        <li>
          <b>Each stat becomes a rank from 0 to 1.</b> The raw numbers are not compared, because they mean different
          things in different seasons: 50 goals was rarer in 1998 than in 1982. Instead, each stat becomes the player's
          place in that season's order, as a number from 0 to 1: 0 for the lowest, 1 for the highest, 0.5 for the
          middle. A forward who scored more goals a game than three quarters of the forwards has about 0.75 for goals.
        </li>
        <li>
          <b>A score for each rating.</b> Each rating has its own recipe: a starting number, plus each stat's rank
          times how much that stat counts for that rating (its weight). For a forward's Shot Accuracy, shooting
          percentage counts by far the most (a weight of 2.96), goals a little (0.69), and the other stats hardly at
          all. So a forward ranked 0.9 for shooting percentage and 0.8 for goals scores about 0.85 + 2.96 × 0.9 + 0.69
          × 0.8 = 4.07, plus a little from the other stats. The lists below give each recipe's main stats, and{' '}
          <i>All the weights</i>, at the end, gives every recipe in full.
        </li>
        <li>
          <b>Scores become 0 to 6 ratings.</b> The players are lined up by score, and the ratings are handed out in the
          same shares as in the original NHL 94, the lowest scores getting the lowest ratings. For a forward's Agility,
          that is: the lowest 9 per cent get a 1, the next 30 per cent a 2, then 28 per cent a 3, 26 per cent a 4, 7 per
          cent a 5, and the top 1 per cent a 6. Most ratings go up to 6; a few stop lower, because EA gave no one more
          (a forward's Checking stops at 5, for example). One exception: a score high enough to have earned the top
          rating in 1992-93 always earns it, even if that makes more top ratings than the shares above. So a season with
          many standout players has more of them.
        </li>
        <li>
          <b>The season's leader.</b> The player with the season's best number in a rating's main stat always gets the
          top rating for it: the assists leader for Pass Accuracy, the penalty minutes leader for Aggression. This is
          needed because a rank shows only the order, not by how much: Wayne Gretzky's 163 assists in 1985-86 would rank
          just above the next player's, though he was far ahead. (A main stat here is one with a weight of{' '}
          {LEAD_WEIGHT} or more in that recipe. Games played never counts, as many players tie for the most.)
        </li>
        <li>
          <b>Defencemen's Offensive Awareness.</b> EA gave no defenceman more than 4 for it, so defencemen normally stop
          at 4. But each defenceman is also compared with the forwards for it, and keeps the higher result. So Paul
          Coffey (138 points in 1985-86) gets a 5, and Bobby Orr (102 assists in 1970-71, more than any forward) a 6.
        </li>
        <li>
          <b>A ceiling on overall.</b> No one comes out higher overall than the best players of the original game: 100
          for a skater (Mario Lemieux) and 98 for a goalie (Ed Belfour). For a player who would go over, their highest
          ratings come down one step at a time, starting with the one they earned by the smallest margin, until they
          are at the ceiling. Roughness and Aggression are never lowered, because higher is not better for them.
        </li>
        <li>
          <b>Other ratings.</b> Weight is the player's own weight in pounds. Shooting hand, and a goalie's glove hand,
          come from the NHL's data. Fighting has a recipe of its own: penalty minutes count most, and fewer assists count for it too.
        </li>
        <li>
          <b>Team ratings.</b> Offence comes from goals scored a game, and Defence from goals allowed a game; from
          1977-78 on, the power play and penalty kill come from that season's percentages. On each, the teams are put
          in order and handed the values the ROM's own teams already had: the best team gets the best of them.
        </li>
        <li>
          <b>Players with too few games for a roster</b> (they matter for Re-rate): each is compared with the players
          who made a roster, and gets the same rating as the rostered player whose score is just at or below theirs.
          This way nobody else's ratings change.
        </li>
      </ol>
      <h4>Where the weights come from</h4>
      <p>
        EA rated the original NHL 94's players from the 1992-93 season. The recipes were tuned so that, given 1992-93's
        stats, they come as close as they can to EA's ratings. Then a few things were changed by hand: height and weight
        no longer count for Agility (the game already slows a heavy player), age counts a little against Agility and
        Speed, and age no longer counts for skills such as passing and shooting, where EA rated veterans higher.
      </p>
      <p>Given 1992-93's stats, the recipes give back EA's own ratings this closely (531 players found in both by name):</p>
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
      <h4>What each rating rests on most</h4>
      {GROUPS.map(({ group, title, goalie }) => (
        <div key={group}>
          <p>
            <b>{title}</b>
          </p>
          <ul>
            {shownWeights(group).map(([label, w]) => (
              <li key={label}>
                {shownName(label, goalie)}: {restsOn(w, goalie ? GOALIE_STATS : SKATER_STATS)}. Share of the original
                game's players at each rating: {shares(w.count)}.
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="note">
        "+" means more of that stat raises the rating, and "−" means more of it lowers the rating. A goalie's goals
        against average is turned round first, so a lower average counts as more. Roughness is the game's shoot-or-pass
        setting: the higher it is, the more a computer player shoots rather than passes, so it rises with shots and
        falls with assists.
      </p>
      <details>
        <summary>All the weights</summary>
        <p className="note">
          Each recipe is the start, plus each weight times the player's rank in that stat (0 to 1). "Top rating from"
          is the score that earned the top rating in 1992-93: any player who reaches it gets that rating.
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
