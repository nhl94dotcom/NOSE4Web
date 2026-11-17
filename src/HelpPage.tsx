import { SUPPORTED_GAMES } from './core/games'
import { LOGO_COLORS } from './core/graphics'
import { MAX_ROSTER, MIN_ROSTER } from './core/roster'
import { GOALIE_RATING_USES, SKATER_RATING_USES, SNES_GOALIE_RATING_USES, SNES_SKATER_RATING_USES } from './core/ratinguse'
import { MAX_SECONDS } from './core/settings'
import { CSV_TABLES } from './core/tables'

const SECTIONS = [
  ['start', 'Getting started'],
  ['narrow', 'On a phone or tablet'],
  ['space', 'Space in the ROM'],
  ['teams', 'Teams'],
  ['players', 'Players and goalies'],
  ['ratinguse', 'What the ratings do in play'],
  ['arrows', 'Moving with the keyboard'],
  ['copy', 'Copy and paste'],
  ['keys', 'Quick edit keys'],
  ['lines', 'Lines'],
  ['colours', 'Team colours'],
  ['pictures', 'Logos and banners'],
  ['genesis-score-logos', 'Score logos (Genesis)'],
  ['genesis-blood', 'Head bleeding (Genesis)'],
  ['photos', 'Player photos'],
  ['picturefiles', 'Picture files'],
  ['rink', 'Rink colours'],
  ['settings', 'Game settings'],
  ['midi', 'MIDI files for organ songs'],
  ['byname', 'Matching teams by name'],
  ['reset', 'Resetting changes'],
  ['csv', 'Spreadsheet files'],
  ['project', 'Project files'],
  ['league', 'The league at a glance'],
  ['trade', 'Trades and free agents'],
  ['bulk', 'Bulk changes'],
  ['hacks', 'Hacks'],
  ['importteam', 'Importing a team'],
  ['check', 'Checking a ROM'],
  ['rules', "Your league's rules"],
  ['changes', 'Changes and seasons'],
  ['compare', 'Comparing two ROMs'],
  ['download', 'Downloading your work'],
  ['roms', 'Supported ROMs and limits'],
  ['snes', 'The SNES game'],
  ['nhl95', "NHL '95"],
  ['trouble', 'If something goes wrong'],
  ['credit', 'Credit'],
]

export function HelpPage() {
  return (
    <main className="team help" data-no-tabs>
      <h2>How to use NOSE4Web</h2>
      <ul className="contents">
        {SECTIONS.map(([id, title]) => (
          <li key={id}>
            <a href={`#help-${id}`}>{title}</a>
          </li>
        ))}
      </ul>

      <h3 id="help-start">Getting started</h3>
      <ol>
        <li>
          Click <b>Open ROM…</b> and choose your ROM file. It is read by this browser tab only. Nothing is uploaded.
        </li>
        <li>
          Pick a page from the list on the left. It is in groups: <b>Game</b> (Teams, Game settings, Hacks and Rink
          colours), <b>League administration</b> (the League page, Trade, Bulk changes and Import a
          team), <b>Files</b> (spreadsheets, pictures and project files) and <b>Review</b> (Check ROM, Changes and
          Compare ROMs), then Help.
        </li>
        <li>
          <b>Teams</b> opens a team's page. Choose the team from the list at the top of the page; ◀ and ▶ beside it go to
          the team before and after.
        </li>
        <li>Make your changes. They take effect in the editor straight away, with no Apply button.</li>
        <li>
          Click <b>Download ROM</b> to save the edited ROM, then try it in an emulator.
        </li>
      </ol>
      <p>
        The file you opened is never altered. Each download is a new file, named after the <b>Name</b> box at the top
        of the page. Keep your original ROM somewhere safe all the same.
      </p>
      <p>
        A note at the top reads <i>Not downloaded yet</i> while there are changes you have not saved, and the browser
        will warn you before closing or refreshing the tab.
      </p>
      <p>
        <b>Undo</b> and <b>Redo</b> at the top step back and forward through your changes, as do <kbd>Ctrl</kbd>+
        <kbd>Z</kbd> and <kbd>Ctrl</kbd>+<kbd>Y</kbd>. Typing in one box counts as a single step. Opening a ROM
        starts the history afresh.
      </p>
      <p>
        Your work is also kept in this browser, on this computer, a moment after each change. If the tab is closed or
        refreshed, the welcome screen offers <b>Continue editing</b> to pick it up again, or <b>Discard it</b>. Only
        the most recent ROM is kept, the undo history is not, and none of it leaves your computer.
      </p>
      <p>
        A page with several sections shows one at a time: pick one from the tabs along the top, or use the left and
        right arrow keys once a tab is selected. A team's page opens on <b>Team</b> (names, counts and ratings), with
        the players on <b>Roster</b>. <b>All</b> shows every section on one long page. Each page remembers its tab,
        and all the teams share one, so going from team to team stays on, say, Lines. On the Hacks pages,{' '}
        <b>Apply</b> is under every tab.
      </p>
      <p>
        When a page shows all its sections (under <b>All</b>, or on a page without tabs), click a section's heading
        (or Tab to it and press Enter) to fold it away, and again to open it. Folded sections stay folded on every
        team and next time you come back. On the Hacks pages each option has a one-line summary; <b>More about it</b>{' '}
        opens the full description.
      </p>

      <h3 id="help-narrow">On a phone or tablet</h3>
      <p>
        The editor fits itself to the window. On a phone, a tablet held upright, or any narrow window, a few things
        are arranged differently. Nothing is missing.
      </p>
      <ul>
        <li>
          The list of teams and pages is tucked away. The button at the top left names the page you are on; tap it
          to slide the list in, and tap a team or page to go there.
        </li>
        <li>
          The top bar keeps Undo, Redo, the space left in the ROM (such as <i>120 bytes free</i>) and <b>Download ROM</b> in view. <b>More</b> opens the rest:
          adding roster space, opening another ROM, and downloading a patch.
        </li>
        <li>
          Players are shown as cards in place of a wide table. Each card is one line: the tick-box, the player's
          place and position, his name, and a button showing his overall rating. Tap that button to open the card
          and edit his number and every attribute, or to move or delete him. Several cards can be open at once.
        </li>
        <li>Lines are cards too, with one position to a row.</li>
        <li>
          Other wide tables, such as the trade screen's and the League page's, scroll sideways inside their own
          box, with the name column staying in view.
        </li>
      </ul>
      <p>
        Turning a tablet, or resizing a window, switches between the two arrangements at once and keeps your work.
        The keyboard shortcuts for moving between boxes belong to the table arrangement.
      </p>

      <h3 id="help-space">Space in the ROM</h3>
      <p>
        All the teams' names and players share one fixed amount of room in the ROM. The figure at the top of the
        page, such as <i>120 bytes free</i>, is how much of it is left. If it reads <i>bytes over the limit</i>, you
        cannot download until you free some room.
      </p>
      <ul>
        <li>Each letter of a player or team name takes one byte (a name with an odd number of letters takes one extra).</li>
        <li>Each player takes 10 bytes plus his name. A newly added player takes 14.</li>
        <li>Ratings, jersey numbers, lines and colours take no extra room, however you change them.</li>
        <li>The room is shared: shortening a name on one team makes room on any other.</li>
      </ul>
      <p>
        The original NHL 94 ROM has no free space at all, so a name can only grow if another shrinks. For that ROM a
        button appears at the top:
      </p>
      <ul>
        <li>
          <b>Add 934 bytes of roster space</b> frees room by moving some text from the opening screens elsewhere in
          the ROM. The ROM stays the same size.
        </li>
        <li>
          After that, <b>Add 512 bytes of roster space</b> frees more by moving the playoff tables too. This doubles
          the ROM file to 2 MB, which emulators and flash cartridges handle normally.
        </li>
      </ul>
      <p>
        Neither can be undone except by opening the ROM again. ROMs that already have more room, such as the 30-team
        hack, do not show the button and usually have plenty of room already.
      </p>
      <p>
        A Genesis ROM never grows past 2 MB in the editor, because in a bigger ROM the game can no longer save its
        records. If a 2 MB ROM is full when something needs more room (more roster space, logos, a hack or a new
        player photo), the editor says so and changes nothing. The one exception is chaos's fighting patch (on the
        Hacks page): it makes the ROM 3 MB and still keeps saving working.
      </p>
      <p>
        On the SNES, teams are stored whole in two separate areas, and a team cannot be split between them. So the
        rosters can fit in total and still not fit as whole teams. Then the figure at the top says how many bytes
        over you are, and shortening a few names or removing a player makes it fit. The original game has room for
        every team at 26 players (the most it allows) with names of about 11 letters on average.
      </p>

      <h3 id="help-teams">Teams</h3>
      <p>The top of a team's page has:</p>
      <ul>
        <li>
          <b>Location, Initials, Name, Stadium</b>: the four pieces of text the game shows for a team. Only letters,
          digits and common punctuation can be used, since that is all the game's font contains.
        </li>
        <li>
          <b>Forwards</b> and <b>Goalie bytes</b>: the game decides who plays where by roster order, not by each
          player's own position. The first players on the roster are the goalies, the next ones the forwards, and
          the rest the defencemen; the line under these boxes says how many of each the team has now, and each row's{' '}
          <b>Pos</b> column shows where that player ends up.
          <ul>
            <li>
              <b>Goalie bytes</b> set how many goalies: four boxes, one for each goalie. Put 1 in a box for each
              goalie, from the left, and 0 in the rest: 1 1 0 0 is two goalies, 1 1 1 0 three. The original rosters
              have other numbers there, such as 13 6 0 0, but the game only checks whether each box is 0, so 13 6 0
              0 plays exactly like 1 1 0 0.
            </li>
            <li>
              <b>Forwards</b> sets how many of the skaters after the goalies are forwards, counted from the top of the
              Skaters table; the rest are defencemen. After adding or removing a forward, change this number to match.
            </li>
          </ul>
        </li>
        <li>
          <b>Offence, Defence, Penalty kill, Power play, Home, Away</b>: the six team ratings, which both games read
          the same way. For Offence (0 to 7), Power play and Home (0 to 2) a high number is good. For Defence (0 to
          7), Penalty kill (0 to 2) and Away (0 to 2, with 3 for the original game's weakest teams) a <b>low</b>{' '}
          number is good. wboy and smozoma first worked out what they mean:
          <ul>
            <li>
              <b>Offence and Defence</b> (the team's, not its players' awareness ratings) only decide the other
              playoff games, the ones the game plays out on its own and shows on the score ticker. The higher a
              team's Offence and the higher the other team's Defence, the more goals it is likely to score. Only 0 to
              7 count. They do nothing in the game you play.
            </li>
            <li>
              <b>Home and Away</b>: when a player comes on the ice, the home team adds its Home rating to his
              Offensive and Defensive Awareness, Stickhandling, Shot Accuracy and Passing, and the away team takes its
              Away rating off the same five.
            </li>
            <li>
              <b>Power play and Penalty kill</b>: a team on the power play adds its Power play rating to Offensive
              Awareness, Stickhandling, Shot Accuracy and Passing, and a team killing a penalty takes its Penalty kill
              rating off the first three. Because of a bug in the game, the two are used the other way round from
              how the original data and the forums describe them, so Anaheim, meant to be weakest at both, plays with
              the best of both. Earlier versions of this editor followed the forums. The{' '}
              <b>power play and penalty kill fix</b> on the Hacks page (both games) makes the game use them as
              intended; with it on, the team page and the Teams spreadsheet show the two that way round.
            </li>
          </ul>
          These are small changes: on the game's own scale a rating point is worth 5, so 2 is less than half a
          point. In the Teams spreadsheet they are the six rating columns; older files name the power play and
          penalty kill columns the old way round, and still load into the same values.
        </li>
        <li>
          <b>Overall shown</b>: the team rating the game shows on the matchup screens and the player cards (on the
          Genesis the cards' "Team Rating"). It is just a stored number, so it does not change when the roster does
          (on the Genesis it is only shown, never used in play). <b>Use roster average</b> sets it to the average
          overall rating of everyone on the roster, goalies included, and <b>Bulk changes</b> does that for every
          team at once. The Genesis shows two digits, so it goes up to 99. It is in the Teams spreadsheet too.
        </li>
      </ul>
      <p>
        In the original game the two New York teams are shown using text built into the game ("New York Islanders",
        "New York Rangers"). If you change either team's location, the editor switches the game over to the name
        you typed.
      </p>

      <h3 id="help-players">Players and goalies</h3>
      <p>
        Goalies and skaters are in separate tables because they use the attribute columns for different things. Hover
        over a column heading to see its full name.
      </p>
      <ul>
        <li>
          <b>Name</b>: the game expects a first and last name separated by a space.
        </li>
        <li>
          <b>No.</b>: the jersey number, 00 to 99. A number another player on the team wears too shows in red; hover it to see who.
        </li>
        <li>
          <b>Ovr</b>: the overall rating the game will show. It is worked out from the attributes as you edit and
          cannot be typed in.
        </li>
        <li>
          <b>LV</b>: the <b>league value</b>, a 0–99 rating from the NHL94 Match Viewer project, based on what each
          rating was actually worth in the leagues' own games. The Genesis and SNES games play differently, so each
          has its own formula and the same player can be worth quite different amounts on the two; the editor shows
          the one for your ROM. Like Ovr it updates as you edit, and <b>Show in order of</b> can sort a roster by it.
          The scale runs from the original game's weakest player to its strongest, so a value means the same in every
          ROM of that system. ROMs with 0–15 ratings use a different scale and do not show it.
          <p>
            <b>Genesis</b>, from the Classic leagues' games since 2013. It predicts how strong a team is far better
            than the game's Overall, which ignores Weight.
          </p>
          <ul>
            <li>
              <b>Forwards</b>: Shot Power most, then Speed, Shot Accuracy, Stickhandling and Agility. Weight counts
              against, more than any one rating counts for, so light shooters come out high and heavy stars lower
              than their Overall.
            </li>
            <li>
              <b>Defencemen</b>: Pass Accuracy, Checking, Agility and Speed most, then a little Shot Power and Shot
              Accuracy, with Weight, Off. Awareness and Stickhandling a little against. A middleweight (Weight 7 to 9 in
              the 0–15 view) loses about 10 more points, since he is not really suited to either kind of check.
            </li>
            <li>
              <b>Goalies</b>: Agility only, worth about a quarter of a goal a game for each step.
            </li>
            <li>
              How much Weight costs is not certain (somewhere between a sixth of a point and 1.3 points a step, about
              half a point most likely), but heavy stars come out lower anywhere in that range.
            </li>
            <li>
              Defencemen are valued mainly on offence; how much they stop goals against is not measured yet.
            </li>
            <li>
              Off. and Def. Awareness count for almost nothing. Tests showed they make too little difference to
              measure, and they only affect the skaters a person is not controlling.
            </li>
            <li>A goalie's Agility only counts while the computer plays him. A person in net always has the longest reach.</li>
          </ul>
          <p>
            <b>SNES</b>. Here Weight counts <i>for</i> a player: the SNES game has no weight bug, heavier players
            check a little better, and weight slows them down less. The leagues' results agree: heavier forwards score
            a little more and are found on stronger teams.
          </p>
          <ul>
            <li>
              <b>Forwards</b>: Speed, Shot Power, Shot Accuracy, Agility and Stickhandling, almost equally, and a little
              for Weight.
            </li>
            <li>
              <b>Defencemen</b>: Stickhandling and Speed most, then Off. Awareness, Weight and Checking, with Pass
              Accuracy and a little Agility, Shot Power and Shot Accuracy against. A defenceman with Weight 7 or more
              in the 0–15 view is worth about 15 points more than a lighter one.
            </li>
            <li>
              <b>Goalies</b>: Agility only, but it matters little on the SNES, so goalies' values show who is better,
              not by how much.
            </li>
            <li>
              SNES team strength varies a lot from season to season, so team results cannot confirm the league value
              (or the game's Overall). The SNES value is based on the players' own results.
            </li>
          </ul>
        </li>
        <li>
          <b>Wgt</b>: weight in pounds, in steps of 8 from 140 to 260.
        </li>
        <li>
          <b>Ratings</b> such as Agl and Spd: seven levels, shown as the range the game displays for each, from 25-29
          up to 99.
        </li>
        <li>
          <b>H/F</b> (skaters): shooting hand and fighting together, such as R/57. The original game has no
          fights; there, fighting decides whether a player he injures is out for the period or the game.
        </li>
        <li>
          <b>GlH</b> (goalies): glove hand, L or R.
        </li>
        <li>
          <b>L@0</b> (goalies): not used by the game. Leave at zero.
        </li>
      </ul>
      <p>
        Tick <b>Show attributes as stored values (0–15)</b> to see and choose the raw numbers kept in the ROM. That
        view also allows values the game does not normally use, such as a rating above 99, for experimenting. Such
        values appear in red with a ! in the normal view.
      </p>
      <p>
        Point at a column heading to see what that rating does in play; <a href="#help-ratinguse">What the ratings
        do in play</a> lists them all.
      </p>
      <p>The buttons at the end of each row:</p>
      <ul>
        <li>
          <b>↑ ↓</b> move a player up or down the roster. The lines keep pointing at the same people. Moving a skater
          across the forward and defence boundary, or between the two tables, changes what they are.
        </li>
        <li>
          <b>✕</b> deletes a skater. Any line that used them gets the last player on the roster instead, so check the
          lines afterwards. A team cannot go below {MIN_ROSTER} players, and goalies cannot be deleted directly.
        </li>
      </ul>
      <p>
        <b>Add player</b> puts a new defenceman at the bottom of the roster, named with their roster number, with
        every attribute at its lowest. A team can have at most {MAX_ROSTER} players.
      </p>
      <p>
        To trade a skater, tick them, choose the other team beside <b>Move ticked to</b>, and click it. A forward
        joins the end of the other team's forwards and a defenceman the end of its roster, and both teams' lines are
        kept in step. Goalies cannot be moved this way; copy one and paste over a goalie on the other team.
      </p>
      <p>
        <b>Show in order of</b> lists the players by first name, last name, jersey number or overall rating, and <b>Find</b> shows
        only those whose name contains what you type. Both change only what you see. The roster itself stays in the
        order the game uses, and the move buttons are switched off until you return to roster order with nothing in
        Find.
      </p>

      <h3 id="help-ratinguse">What the ratings do in play</h3>
      <p>
        The NHL94 Match Viewer project worked out what each rating does in the game, and checked much of it against
        recorded games. Being hot or cold moves a rating up or down a little, and the team ratings nudge some of
        them. What each one does:
      </p>
      <ul>
        {Object.entries(SKATER_RATING_USES).map(([label, use]) => (
          <li key={label}>
            <b>{label}</b>: {use}.
          </li>
        ))}
      </ul>
      <p>And for goalies:</p>
      <ul>
        {Object.entries(GOALIE_RATING_USES)
          .map(([label, use]) => (
            <li key={label}>
              <b>{label}</b>: {use}.
            </li>
          ))}
      </ul>
      <p>
        So for a league: the goalie ratings StR, StL and GvR change nothing; Endurance does nothing with line changes
        off; and in the original game a higher Aggression or GvL does not help. The Aggression bug fix on the Hacks
        page puts Aggression right.
      </p>
      <p>
        On the SNES the ratings do much the same, with the differences below (the column headings on an SNES team
        page show them too). Also, because of the game's hot and cold bug, about half of every player's ratings are
        at the maximum each game, whatever they are in the ROM, unless the ROM has the hot and cold bug fix from the
        Hacks page.
      </p>
      <ul>
        {Object.entries(SNES_SKATER_RATING_USES).map(([label, use]) => (
          <li key={label}>
            <b>{label}</b>: {use}.
          </li>
        ))}
      </ul>
      <p>And for SNES goalies:</p>
      <ul>
        {Object.entries(SNES_GOALIE_RATING_USES).map(([label, use]) => (
          <li key={label}>
            <b>{label}</b>: {use}.
          </li>
        ))}
      </ul>

      <h3 id="help-arrows">Moving with the keyboard</h3>
      <p>
        In the roster tables and the lines table, the keyboard moves from box to box as it does in a spreadsheet.
      </p>
      <ul>
        <li>
          <b>Up</b> and <b>Down</b> go to the same column of the row above or below. <b>Enter</b> goes down.
        </li>
        <li>
          <b>Left</b> and <b>Right</b> go along the row. In a name or a number they move the cursor first, and go to
          the next box only from the end. <b>Tab</b> always goes to the next box.
        </li>
        <li>
          In a list, the arrows move between boxes and no longer change the choice. To choose, hold <b>Alt</b> and
          press <b>Down</b> to open the list, or click it.
        </li>
        <li>
          In an attribute's list, <b>+</b> and <b>-</b> raise and lower it one step, stopping at the top and bottom
          of its range. Either the main keys or the number pad will do, and the key beside minus counts as plus
          without Shift. This changes the one box you are in; the Quick edit keys change every ticked player.
        </li>
        <li>
          Clicking into a number box, such as a jersey number, selects it, so what you type replaces it. You can empty
          the box and type the number afresh; it is outlined in red until it holds a number it can take, and shows the
          number as it is again when you leave it. <b>+</b> and <b>-</b> step it, and so do <b>Up</b> and{' '}
          <b>Down</b> in boxes outside these tables.
        </li>
        <li>
          Where attributes show as stored values, type a number into a list to set it. Two digits typed quickly
          together count as one number, so 1 then 2 gives 12.
        </li>
      </ul>

      <h3 id="help-copy">Copy and paste</h3>
      <p>
        Players, lines and playoff draws each have tick-boxes and <b>Copy ticked</b> and <b>Paste over ticked</b>{' '}
        buttons.
      </p>
      <ol>
        <li>Tick the rows to copy and click Copy ticked.</li>
        <li>Go to where they should end up: another team, or another ROM open in a second browser tab.</li>
        <li>Tick the rows to replace and click Paste over ticked.</li>
      </ol>
      <ul>
        <li>A paste replaces the ticked rows. It does not insert new ones. To bring in an extra player, add a player first and paste over the new row.</li>
        <li>If you tick more rows than you copied, the copied rows repeat to fill them.</li>
        <li>
          A pasted player brings his photo: his own, or, if he had none, the stand-in the game gives a player without one,
          in place of the photo of the player he replaces. On the Genesis a player with a photo of his own who was not
          among the featured players is added to them. On the SNES the photo is reshaded to the team's own photo
          colours, so between teams it may look a little different. Players moved with Move ticked to, or traded,
          take their photos with them too.
        </li>
        <li>
          <b>Paste attributes only</b> keeps each row's name and jersey number, and its photo.
        </li>
        <li>Goalies can only be pasted over goalies, and skaters over skaters.</li>
        <li>
          Lines are copied as roster positions, not names, so they suit a team whose roster is in the same order. A
          paste is refused if it refers to a position the team does not have.
        </li>
        <li>The first time you paste, your browser may ask permission to read the clipboard. Copying between tabs needs it.</li>
      </ul>

      <h3 id="help-keys">Quick edit keys</h3>
      <p>
        Tick <b>Quick edit keys</b>, tick one or more players, and use the top row of the keyboard to change them all
        at once:
      </p>
      <ul>
        <li>
          The keys <kbd>`</kbd> <kbd>1</kbd> <kbd>2</kbd> … <kbd>9</kbd> <kbd>0</kbd> <kbd>-</kbd> <kbd>=</kbd>{' '}
          <kbd>Backspace</kbd> each raise one attribute by a step, in column order from the first attribute column to
          the last. <kbd>\</kbd> also works for the last column.
        </li>
        <li>
          Hold <kbd>Shift</kbd> to lower instead.
        </li>
        <li>
          <kbd>+</kbd> and <kbd>-</kbd> on the number pad change the jersey number.
        </li>
      </ul>
      <p>
        The keys do nothing while you are typing in a box. With the option on, hovering over a column heading shows
        its key.
      </p>

      <h3 id="help-lines">Lines</h3>
      <p>
        Each row is one of the game's line combinations, and each column a position on the ice. Choose a player for
        every position. The first line on the list, NLC, is the one used when line changes are off. With line
        changes on Auto it also takes Sc1's place as the first line in the rotation; with them On, Sc1 is used and
        NLC not at all.
      </p>
      <p>
        Each line's <b>Rating</b> is the average overall of its five skaters; point at it to see the forwards and the
        defence pair separately. The team's <b>Overall</b>, above the lines, is the average of every skater on the
        Sc1, Sc2 and Chk lines (each counted once) and the NLC goalie: the team as it plays with line changes on.
        Both update as you change the lines or the players.
      </p>
      <p>
        <b>Build ticked</b>, <b>Build all lines</b> and <b>Fix broken lines</b> fill lines from the players' ratings,
        by what each line is for: the best defence pair and forwards on NLC, the best scorers on Sc1, Sc2 and the
        power plays, checkers on Chk, and defensive players on the penalty kill (resting the power play's forwards
        when the roster is deep enough). The best playmaker of the three forwards plays centre. The extra attacker
        is the best scorer not on the line, and the goalie stays the team's current starter.
      </p>
      <p>
        When a line's two wingers, or its defence pair, shoot with different hands, <b>Wingers</b> and{' '}
        <b>Defence</b> choose their sides: each on his shooting side (a left shot on the left), each on his off side
        (a left shot on the right, as many players like their wingers), or either. They only swap the two players
        chosen, never change who is chosen, and the choice is remembered in this browser. For defencemen the hand also
        decides which way he turns when he turns right around: a left shot turns to his right, a right shot to his
        left. So defencemen on their shooting side turn toward the middle, and on their off side toward the boards.
        This is only on a full about-turn; a defenceman skating back to his own net with the puck ahead of him often
        skates backwards instead. (Found by the NHL94 Match Viewer project and tested in the game on both systems.)
      </p>
      <p>
        <b>Fix broken lines</b> rebuilds only the lines with a mistake: an empty position (other than those a 3 on
        3 or smaller ROM leaves empty), a player past the end of the roster, a goalie out of goal or a skater in
        goal, or a skater on a line twice. The ratings are only a guide to how a player plays, so take the result as
        a starting point and change what you like; Undo takes it back. The League page does the same for every team
        at once.
      </p>
      <p>
        Each position offers only the players it is for, as the game's own Edit Lines does: goalies in the G column,
        defencemen at LD and RD, and forwards at LW, C and RW and as the extra attacker (EA). Whether a skater
        is a forward or a defenceman comes from the roster: the forwards come first. Choosing a player who is already
        in another position on the line swaps the two, so no one is on a line twice.
      </p>
      <p>
        A player twice on a line needs fixing. The game puts both of him on the ice, but soon one of them leaves,
        and the team plays a skater short, with no penalty, until the next line change. With line changes off, that
        can be the rest of the period. Check ROM reports it as a problem, and the editor shows the two positions in
        red. The extra attacker does not count: the original game often repeats a player there. Deleting a player,
        or loading a roster from the spreadsheet files, never leaves one twice on a line: his places go to another
        skater.
      </p>
      <p>
        Some ROMs put a skater out of his role on purpose, such as forwards on the points of a power play, or a
        forward on defence in the original SNES game. The editor keeps such a choice, labels it with his role, and
        Check ROM notes it. If you choose someone else, you cannot pick him there again except through the
        spreadsheet files. An SNES ROM with the hack <b>Any skater at any position in Edit Lines</b> (on the Hacks
        page) lets players do this in the game, so there every position offers every skater, and Check ROM does not
        mention it.
      </p>
      <p>
        On both systems the game's Edit Lines shows only four positions for the penalty-kill lines (PK1 and PK2):
        LD, RD, LW and C. Their RW is still used, though: a short-handed team that pulls its goalie sends that skater
        on, not the extra attacker, who only comes on at full strength (found by the NHL94 Match Viewer project). The
        editor shows that RW with a dashed border, and you can change it like any other position. The game's own Edit
        Lines never lets you change the extra attacker either, on any line.
      </p>
      <p>
        ROMs hacked to put fewer skaters on the ice, such as 3 on 3, 2 on 2 and 1 on 1, leave the unused positions
        empty on every team. The editor recognises this: those positions show <b>Empty</b>, Check ROM does not
        report them, and the lines sheet of the spreadsheet files has blank cells for them. Leave them empty unless
        you know the ROM uses them. The League page rates a first line on the skaters it has. These ROMs are played
        with line changes off, so NLC is the only line that matters in them.
      </p>

      <h3 id="help-colours">Team colours</h3>
      <p>
        Each team has 16 home and 16 away colours. Click a swatch to select it; its purpose, such as{' '}
        <i>Pants (dark)</i>, is shown beside the controls. Change it with:
      </p>
      <ul>
        <li>the <b>Red, Green, Blue</b> sliders, each with the levels the console can show;</li>
        <li>
          <b>Pick</b>, your browser's colour chooser;
        </li>
        <li>
          <b>Pick from screen</b> (Chrome and Edge only), which takes the colour of anything you click on your
          screen;
        </li>
        <li>
          <b>Pick from an image…</b>, which shows a picture you choose, such as a logo, and takes the colour where
          you click.
        </li>
      </ul>
      <p>
        Every colour is matched to the nearest one the console can display, so a picked colour may shift
        slightly. The pictures beside the swatches redraw as you work. <b>Copy from away</b> and{' '}
        <b>Copy from home</b> copy one set over the other.
      </p>

      <h3 id="help-pictures">Logos and banners</h3>
      <p>
        At the bottom of a team's page are its four pictures: the <b>centre-ice logo</b>, the <b>menu logo</b>, the{' '}
        <b>menu banner</b> and the <b>in-game banner</b>. Each can be drawn in the editor, or changed in another
        program.
      </p>
      <p>
        <b>Draw…</b> opens the picture drawn large, to paint pixel by pixel in the colours the game gives it:
      </p>
      <ul>
        <li>
          <b>Pencil</b>, <b>Eraser</b> (back to see-through), <b>Fill</b> (the joined pixels of one colour),{' '}
          <b>Pick a colour</b> (from the picture), <b>Line</b>, <b>Rectangle</b> and <b>Filled rectangle</b>. The
          letters P, E, F, I, L, R and B choose them.
        </li>
        <li>
          <b>Mirror left and right</b> paints each stroke on both sides, for a logo that is the same both ways.{' '}
          <b>Flip</b> turns the whole picture over, and the arrows move it a pixel at a time.
        </li>
        <li>
          The colours to paint with are only those the picture can use: the home colours for the centre-ice logo,
          the banner colours for a menu banner, and for the menu logo white, black and its nine own colours, which
          can be changed right there. The grid marks every pixel, and its darker lines the squares of 8 by 8 pixels
          the game builds every picture from.
        </li>
        <li>
          Each stroke goes into your work when you let go of the mouse, so <b>Undo</b> takes back one stroke at a
          time. A stroke that makes the picture need more room than the game has is not kept: the editor says{' '}
          <b>Edit rejected</b>, and why, beside the picture.
        </li>
      </ul>
      <p>Or change a picture in another program:</p>
      <ol>
        <li>
          Click <b>Export PNG</b> to save the picture as it is now.
        </li>
        <li>Change it in any image editor, keeping its size in pixels. Work zoomed in; these are small pictures.</li>
        <li>
          Click <b>Import…</b> and choose your file.
        </li>
      </ol>
      <ul>
        <li>
          The size must match exactly: 48 by 32 for the centre-ice logo, 48 by 48 for the menu logo, and 88 by 16 for
          each banner.
        </li>
        <li>See-through parts of your image stay see-through, showing the ice or the menu behind.</li>
        <li>
          A logo saved with a solid background (MS Paint cannot save a see-through one, and nor can a JPEG) has the background
          around it made see-through when you import it, on both platforms: the colour in its four corners, where it reaches
          the edge. Press <b>Import it with its background instead</b> to keep the background. Banners are left as they are.
        </li>
        <li>
          The <b>centre-ice logo</b> is drawn with the team's 16 home colours, the same ones the players wear. Every
          pixel is matched to the nearest of them, so set the home colours first.
        </li>
        <li>
          The <b>menu logo</b> can use white, black, and {LOGO_COLORS} colours of its own, taken from your image.
          If the image has more, the least used are merged into the nearest.
        </li>
        <li>
          The <b>menu banner</b> has two stripes in the team's <b>menu banner colours</b>, which are set just below
          the pictures, plus the fixed colours of the lettering.
        </li>
        <li>The <b>in-game banner</b> uses 16 colours that every team shares.</li>
      </ul>
      <p>
        The game builds each picture from squares of 8 by 8 pixels and keeps only one copy of squares that are the
        same, so empty areas, plain areas and repeated shapes take less room than fine detail. The room is limited
        and shared: in the original game, the menu logos of all teams have space for only about eleven more squares
        between them, and the banners have none to spare beyond what the replaced banner frees. If a picture does
        not fit, the editor says by how much and changes nothing.
      </p>
      <p>
        When that happens, <b>Give logos and banners more room</b>, below the pictures, moves the menu logos and both
        sets of banners to unused space at the end of the ROM, where every one of them can be as detailed as you
        like. In the original game this doubles the ROM file to 2 MB, which emulators and flash cartridges handle
        normally. It cannot be undone except with Undo or by opening the ROM again, and the button disappears once
        the pictures have their room.
      </p>
      <p>
        Some hacked ROMs, such as the 30-team one, show the same two menu banners for every team: one saying
        "Home" and one saying "Visitor". The editor then lists a home and a visitor menu banner, and replacing
        either replaces it for every team. Give the logos and banners more room and each team gets a home and a
        visitor banner of its own, which you can then replace one team at a time, for instance with team names.
      </p>
      <p>
        In the original game the two All Stars teams share one centre-ice logo, so changing it for one changes it
        for both. Logos and banners are not part of the spreadsheet files.
      </p>
      <h3 id="help-genesis-score-logos">Score logos (Genesis)</h3>
      <p>
        During play the game shows each team's three letters in the score box. <b>Add score logos for every team</b>,
        under Score logo on any team's page, shows a small logo there instead (an idea from McMarkis's 32-team SNES
        build). The score box grows a little taller to make room for a 24 by 16 pixel logo beside each score. The
        home team plays in its home colours and the visitors in their away colours, so each team has two logos, one
        in each set of colours, both on black (the uniform's third colour, black in the original game). Every team
        starts with logos made from its centre-ice logo. Import or draw the home one and the away one is made from
        it; changing the uniform colours changes the logos with them. <b>Show Boston's letters instead</b> and{' '}
        <b>Give Boston a score logo</b> act on that team alone, and <b>Take score logos out of this ROM</b> puts the
        game back as it was. In the original game, adding them makes the ROM 2 MB. ROMs with a different score box,
        such as EVO, do not offer them.
      </p>
      <h3 id="help-genesis-blood">Head bleeding (Genesis)</h3>
      <p>
        In NHLPA '93 a player hurt by a check lies on the ice with blood spreading from his head; NHL '94 took the blood
        out. <b>Head bleeding</b>, under Looks and screens on the Hacks page, brings it back for a player hurt for the
        game: he falls and lies still as before, now with a little blood that spreads. A player out for the period
        writhes as before, without blood. Only the look changes. The blood uses two of the arena's colours (dark reds in the original game). In the
        original game it makes the ROM 2 MB. Like every hack it goes in when you press Apply, and turning it off puts
        the game back as it was. ROMs with different player graphics, such as EVO, do not offer it.
      </p>
      <h3 id="help-photos">Player photos</h3>
      <p>
        On the Genesis, <b>Player photos</b>, below the logos, lists the team's featured players. The team setup screen shows the
        cards of the first six in turn, so a team always keeps at least six; the matchup screens show the photo of
        any player in the list, and a generic goalie or skater picture for everyone else. In the original game some
        teams have only generic pictures, and the 30-team ROM lists 26 players a team.
      </p>
      <ul>
        <li>
          <b>Import…</b> takes an image of any size: the square in its middle is shrunk to 48 by 48 and shaded in
          the eight greys the game shows photos in (some hacks give them other colours). <b>Export PNG</b> saves a
          photo, <b>Draw…</b> changes it pixel by pixel.
        </li>
        <li>
          A player who has a generic picture, or one shared with another player, gets a photo of his own when you
          import or draw one, added at the end of the ROM; the others keep theirs.
        </li>
        <li>
          In the editor, photos follow their players: when you move, trade, release or reorder players, each takes
          his photo along (and on the Genesis his place among the featured players; one who leaves is replaced there
          only if the team would have fewer than six). <b>Import a team</b> brings a team's photos with its roster,
          under <b>Player photos</b>. ROMs edited elsewhere may have photos on the wrong players: choose who each is
          for in its list. Check ROM warns about a setup screen card for a player the roster does not have.
        </li>
        <li>
          The arrows change the order, which matters for the setup screen's first six. <b>Add a photo for…</b>
          adds a player, with the generic picture until you give him one. Undo takes any of it back.
        </li>
      </ul>
      <p>
        On the SNES every player has a photo, shown on the player cards and the matchup screens: one for each place
        on the roster. Those without one of their own share generic goalie and skater pictures, coloured in the
        team's colours. A team's photos all share its 15 photo colours, so an imported image is shaded to them;
        see-through parts show the card behind. Photos follow their players here as on the Genesis; one traded
        to another team is drawn in that team's photo colours. Colours 1 to 12 are the skin and hair shades every
        team has, and 13 to 15 the uniform as the photos show it. These are separate from the home and away colours,
        so when you change a team's colours, change them too under <b>Uniform colours in the photos</b>, and its
        photos follow. <b>Swap with…</b> swaps two players' photos, to fix a ROM whose photos are on the wrong
        players. Importing a team with its photos brings its photo colours too.
      </p>

      <p>
        <b>Banner lettering</b> makes a banner for you. Type what it should read and choose which banner to use it
        for. It is drawn in the game's own lettering, with the frame and the two stripes the game's banners have;
        the stripes take the team's menu banner colours, so set those first for the in-game banner, whose stripes
        are fixed when it is made. Capital letters, digits, and these marks can be drawn:{' '}
        <code>{'. , : ; ! ? \' " - _ / \\ ( ) [ ] < > + = * # $ % & @'}</code>. A name has to fit
        in 82 pixels, about twelve letters, so use a short form for a long one. A banner starts out reading the
        team's location, as the original game's do.
      </p>
      <p>
        <b>Another team's banners</b> gives this team a copy of another team's banners, and their stripe colours
        unless you untick them, for example to give Anaheim Detroit's. The other team keeps its own. On the SNES,
        where a banner is just its colours and the name lettered on it, <b>Use the banner of</b> under the name
        banner colours copies both. The banner names share very little room, so a longer name may not fit until
        others are shortened; the page says so.
      </p>
      <p>
        <b>Copy to another team</b>, at the foot of a team's page, copies its colours, its logos and banners, or
        both, over another team's. It is a quick way to start a new team from one that looks similar. On the SNES it
        copies the home and away colours with the name banner colours, and the team logo, centre ice logo and score
        logo; a centre ice logo that other teams share in the ROM changes for them too, as when it is replaced.
      </p>

      <h3 id="help-picturefiles">Picture files</h3>
      <p>
        <b>Picture files</b> handles every team's logos, banners and player photos at once, as the spreadsheet
        files do the rest.
        <b> Export all pictures</b> saves them as PNG files in one zip, named with the Name box at the top.
        <b> Import pictures</b> takes a zip, or any number of PNG files, and replaces the pictures they are for.
      </p>
      <ul>
        <li>
          Each file's name says what it is: <code>03_Buffalo_Sabres_menu_logo.png</code>. The number is the team's
          place in the list and the ending is the picture: <code>rink_logo</code>, <code>menu_logo</code>,{' '}
          <code>menu_banner</code>, <code>visitor_banner</code> or <code>game_banner</code>. The team name in the
          middle is only there for you, so renaming a team does not send its pictures astray.
        </li>
        <li>
          A file that shows what the editor already has is skipped. So you can export, edit a few pictures, and
          import the whole zip again: only the ones you changed are replaced, and the page lists them.
        </li>
        <li>
          To carry artwork to another ROM, such as next season's, export from one and import into the other. Teams
          are matched by their place in the list.
        </li>
        <li>A picture several teams share is in the zip once, under the first of those teams.</li>
        <li>
          Player photos are in the zip too, in a <code>photos</code> folder with a folder for each team, such as{' '}
          <code>photos/02_Boston_Bruins/Cam_Neely.png</code>: one file for each player with a photo of his own.
          Each goes back to the player of its name on that team, wherever he now is on the roster, so a set of
          photos carries to next season's ROM. A photo may be any size, as when imported on the team page. On the
          Genesis a player who is not among the featured players is added to them. On the SNES, Picture files
          holds the team logos, the centre ice logos (named <code>centre_ice</code>) and, where the ROM has them, the
          score logos (<code>score_logo</code>), as <code>02_Boston_Bruins_logo.png</code> and the like, alongside
          the photos.
        </li>
        <li>
          Tick <b>Match teams by name</b> when the pictures come from a ROM that lists the same teams in another
          order. Each file then goes to the team named in it, wherever that team is in this ROM, and a file whose
          team is not here is left out. Unticked, files go by their number.
        </li>
        <li>
          Pictures are fitted to the colours they are allowed, as when imported one at a time. A centre-ice logo
          uses the team's home colours, so import the team colours first if they are changing too.
        </li>
        <li>
          If the ROM has no room for some of them, the rest still go in and the page says which did not. Give the
          logos and banners more room on any team's page, then import again.
        </li>
      </ul>

      <h3 id="help-rink">Rink colours</h3>
      <p>
        <b>Rink colours</b>, below the teams, has 16 colours for the ice and 16 for the arena around it. They are
        shared by every rink in the game. Use the list above the picture to preview different parts of the rink and
        the pause menu.
      </p>

      <h3 id="help-settings">Game settings</h3>
      <ul>
        <li>
          <b>Main menu starting choices</b>: what each item on the game's main menu is set to when the game starts:
          the play mode, the two teams, the period length, penalties, line changes, goalie control, and on the
          Genesis the players and user records. A league can set its usual game up so that nobody has to change the
          menu before playing. The SNES 32-team builds add a Fighting line (On, Off
          or After Whistle).
        </li>
        <li>
          <b>Teams in the menu</b>: for a league smaller than the ROM. The menu offers only the first so many teams
          in the team list, so put the league's teams first; the rest stay in the ROM. The game also sticks to them
          when it picks two teams for the demo and for new playoffs, and, with 18 teams or more, for the other scores
          of the day. If a starting team is past them, it becomes the last team offered.
        </li>
        <li>
          <b>Clock</b>: the period lengths in seconds, with the text the menu shows for each, and the overtime and
          shootout lengths. The most a clock can hold is {MAX_SECONDS} seconds. Changing the seconds does not rewrite
          the menu text, so change both.
        </li>
        <li>
          <b>Announcer picture</b>: Ron Barr's picture before each game, on the Genesis's matchup screen and the
          SNES's scouting screen. <b>Import a picture</b> puts one of your own in its place.
          <ul>
            <li>
              Genesis: inside the grey frame, 58 by 67 pixels, in a few colours. A head-and-shoulders photo works best.
            </li>
            <li>
              SNES, in 15 colours, either beside the scouting report's box (72 by 128 pixels at the right, filled and
              cropped to fit, so a tall picture works best) or in Ron Barr's whole place (208 by 128, with the box and
              its text drawn over it as over him). The whole-place picture has limited room, so it has to be a
              cut-out like Ron Barr: a figure on a see-through background. The desk goes, and the screen's frame shows
              wherever the picture leaves space.
            </li>
          </ul>
          <b>Export as PNG</b> saves the picture, and <b>Put back the original</b> brings back the one the ROM was
          opened with. Tested in the game by the NHL94 Match Viewer project.
        </li>
        <li>
          <b>Ron Barr's matchup screen text</b>: what the announcer says in the box before each game, line by line,
          with when the game shows each line. You can change what each line says, but not how many lines there are.
          Words in braces, such as <code>{'{home goalie}'}</code> or <code>{'{crowd record}'}</code>, are filled in by
          the game; the full list is under the lines, and the preview shows the box with example names. The new text
          has to fit in the room the original takes (on the Genesis, emptying the goalies line, which the game never
          shows, gives more room). Some league ROMs (CDL, the CDL dynasty ROM, DPWM3, IDL5, RGDL) had a line taken
          out by hand, so their later lines show at the wrong times and the game can freeze when one team is much
          hotter than the other; <b>Put the missing line back</b>, in the section, fixes it. The game has no &amp;,
          and the Genesis shows ( and ) as small angle brackets. Not offered on EVO, which has its own matchup screen.
          Tested in the game by the NHL94 Match Viewer project.
        </li>
        <li>
          <b>Title screen credits</b> (Genesis): the credits the title screen rolls, a box for each page, one line of
          text to a line of the box. A league can put its own name in them. The original game's pages have up to 4
          lines of up to 25 letters, and the game centres each line; a $ sign shows as the copyright sign. They must
          fit the room the ROM has for them, and the count above the boxes says how much is used. The first page is
          EA's copyright notice; a fourth line on it shows right at the bottom edge of the screen. There must be at
          least one page after the first. The game rolls the credits once after power-on or reset, then goes to the
          menus. Changing the first page's length used to crash the title screen; since 15 November 2026 NOSE4Web
          handles it, and downloading an older ROM again fixes one made before then. From smozoma's forum guide;
          tested in the game by the NHL94 Match Viewer project.
        </li>
        <li>
          <b>Title screen credits</b> (SNES): a box for each credit title. Its first line is the title, and each line
          after it is a name under that title, shown one at a time; every title needs at least one name. The game has
          capital letters (lower case is shown as capitals), digits, spaces, "." and "@", which shows as the copyright
          sign. They must fit the room the ROM has, and the count above the boxes says how much is used (a line used
          twice only counts once). The two copyright lines cannot be changed. The title screen lasts the same time
          however many credits there are, and the original's 17 titles fill nearly all of it, so with fewer titles
          the screen waits with no credits before going to the menus (about a minute with 5). Tested in the game by
          the NHL94 Match Viewer project.
        </li>
        <li>
          <b>Rule messages</b>: the text shown for icing, penalties and so on, how long each stays on screen, and
          the penalty minutes. A message cannot be longer than the space the game gives it. Some appear more than
          once because the game keeps separate copies for different situations.
        </li>
        <li>
          <b>Playoff draws</b>: the game picks one of these at random when a new playoff starts. Each lists 16 teams
          in seeding order. A warning appears if a team is in one draw twice. With fewer teams in the menu than in
          the ROM, <b>Fill the draws with the league's teams</b> makes new draws from the teams the menu offers
          (leaving out All-Star teams), each of them in at least one draw. It needs at least 16 teams. New playoffs
          freeze the game when started with a team that no draw has, so <b>Check ROM</b> says so.
        </li>
        <li>
          <b>Splash screen</b> (Genesis): the second screen at start-up, High Score Productions and Mark Lesser
          Presents in the original game. Import a picture of your own, such as the league's logo, and it takes the
          whole screen, 320 by 224 pixels; a picture of another shape is fitted inside it, on black. The screen can
          show up to 60 colours, and only a few in any small area, so a very colourful picture is simplified to fit.
          wboy's 30-team ROMs already have their own splash screen, which shows here too. <b>Export as PNG</b> saves
          the screen as it is; <b>Put back the original</b> restores the original game's. From kingraph's forum
          reference; tested in the game by the NHL94 Match Viewer project.
        </li>
        <li>
          <b>Main menu background</b> (Genesis): the picture behind the Game Setup screen. Import a picture of your
          own and it is fitted inside the screen, 320 by 224 pixels, in up to 25 colours plus the menu's white, greys
          and black. Room is limited, so a detailed picture is simplified to fit: logos and simple designs come out
          clean, photos blocky. The parts the menu always covers are left blank, so the room goes to the parts that
          show. A picture added with Drezz's forum guide shows here with a warning, because it is too big and draws
          over the team banners; importing it again here makes it fit. Based on Drezz's guide; tested in the game by
          the NHL94 Match Viewer project.
        </li>
        <li>
          <b>Organ songs</b> (Genesis; for NHL '95 see its own section): the songs the organ plays, which each team's page chooses from.{' '}
          <b>Play</b> gives a rough idea of a song in the browser (the console's organ sounds different); while it
          plays, a bar under the list shows where it is, which you can drag to move about the song, and a volume,
          which this browser remembers. The same bar is on each team's page, under its songs.{' '}
          <b>Export MIDI</b> saves it as a MIDI file, and <b>Replace</b> puts a MIDI file of your own in its place:
          <ul>
            <li>every note is played on the game's organ, at most four at once (the rest of the console's sound is
            kept for the sound effects); where more sound at once, the highest are kept, as the tune is usually on top;</li>
            <li>drums are left out, and notes too low or too high are moved by octaves into the game's range;</li>
            <li>every team with that song in one of its slots plays the new one, which the team pages name;</li>
            <li><b>Put back the original</b> restores the game's song.</li>
          </ul>
          Song 1 cannot be replaced, as the game needs it. <b>Used by</b> shows which teams have each song in a slot,
          and whether Random picks from it; the list above it names the songs no team uses, which are the best ones
          to replace. Short tunes of 10 to 30 seconds suit the game, as its own are. Tested in the game by the NHL94
          Match Viewer project. A team's page chooses its six songs (for the start of a period, a home goal and so
          on), with a <b>Play</b> button beside each, so you can hear a song before you settle on it.
        </li>
        <li>
          <b>Game music</b> (NHL '95): its title music (the title screen, the credits and the main menu), end of period
          music and scouting report music (also the playoff and Stanley Cup screens) are played, exported and replaced
          as NHL 94's below, on NHL '95's own instruments: a plucked bass, a brass swell, a mellow horn, a mallet (short
          notes only: it fades fast), a sustained lead, a whistle and the square wave. The console plays one note at a time on each of them but the
          square wave, which plays three, so each instrument takes one part, and of a chord on the others the highest
          note is kept (the lowest on the bass). The drum channel plays on the game's kick, toms, snare and hi-hats. At
          most six of the FM instruments sound at once (the kick and the snare among them), the drums and the bass kept
          first. Not yet tested in the game.
        </li>
        <li>
          <b>Game music</b> (NHL 94 Genesis): the game's three other pieces: the title music (the title screen
          and the main menu), the end of period music (between periods, the pause menu and the playoff screens) and the
          scouting report music. <b>Play</b> gives a rough idea of one, without its drums; the console's synthesizer
          sounds quite different. <b>Export MIDI</b> saves it as a MIDI file, each part on its own channel and the drums
          on the drum channel. <b>Replace</b> puts a MIDI file of your own in its place. Before it goes in you choose
          what each of the file's parts plays on: up to six on the game's instruments (a plucked bass, a whistle-like lead,
          synth brass, a soft pad, an organ and others, named as the NHL94 Match Viewer project heard them), and the drum
          channel on the game's kick (for bass drums) and hit (for the rest), or any part left out. At most five notes
          sound at once, the kick and the bass kept first; a file much louder than the game's own music is played more
          quietly, so that it does not distort; a rest at the file's end is kept; and the new piece plays again from its
          start when it ends, as the game's own do. <b>Put back
          the original</b> restores the game's piece. Tested in the game by the NHL94 Match Viewer project.
        </li>
        <li>
          <b>Game music</b> (SNES): the title music, the menu music (the main menu, and between periods early in the
          playoffs) and the playoff music. <b>Play</b> plays one on the game's own instruments; <b>Export MIDI</b>
          saves it as a MIDI file, each part on a track of its own named as the game names it (such as "BASS" or
          "HORN (L)"), and the drums on the drum channel. <b>Replace</b> puts a MIDI file of your own in its place.
          Before it goes in you choose what each of the file's parts plays on: one of the game's own instruments (the
          bass, brass, chugging, distorted and power guitars, organ, orchestra hit, timpani and others), with how many
          notes each can play at once, and the drum channel on the game's drums (kick, snare, hi-hats, toms, crash and
          cowbell), or any part left out. The console has eight voices for the music, its drums included, and each
          instrument may use only some of them: where an instrument's voices are all taken, the drums are kept first,
          then the bass, then the higher notes. Notes are moved by octaves into each instrument's range, each part is
          played as loud as the game's own parts on its instrument, the file's timing is kept with its rests at the
          start and end, and the new piece plays again from its start when it ends (or from the file's loop marker,
          which the pieces' own MIDI files have: the menu and playoff music start again a moment after their start).
          A part on the organ is played twice, a moment apart, as the playoff music plays its organ. All three pieces
          play on the menus' sounds, the title music too. It needs free room in the ROM:
          the original game has about 6 KB in one place, enough for a piece of about 1,200 notes (the playoff music
          has 700, the title music 1,700). Where a 1 MB ROM has too little, it grows to 2 MB, as it does for the
          fighting, and the piece goes in the new half; the 2 MB builds have plenty. A piece can be up to 32 KB. <b>Put back the original</b> restores the game's piece and frees the
          room; a ROM grown for the music stays 2 MB. Not yet tested in the game.
        </li>
        <li>
          <b>Organ songs</b> (SNES): the same, for the songs the teams and the random picks use. <b>Play</b> plays
          one on the game's own organ. A new song plays
          on the game's two organ sounds, one on each side, at most four notes at once, as the game's own songs do.
          Every team that had the old song gets the new one. Tested in the game by the NHL94 Match Viewer project, on
          the original game and McMarkis's 32-team builds.
        </li>
        <li>
          <b>Move teams</b>: changes the order of the teams, in the Game Setup menu, the team list and the
          spreadsheet files. Use the arrows or <b>Move to</b> beside a team, or{' '}
          <b>Put the first teams in alphabetical order</b> to sort the league's own teams (those the menu offers, up
          to the last playoff team) by name, leaving the All-Star teams and any others after them. Everything about a
          team moves with it: players, lines, names and colours, logos, banners, player photos, organ songs and score
          logos, and the rest. The playoff draws, the main menu's starting teams, the start of the season and the
          league rules' exempt teams follow their teams too, and a project file saved afterwards remembers the move.
          The Reset buttons and Changes still compare each team with itself as opened, and Changes lists the moves;
          Compare ROMs matches teams by name when two ROMs list them in different orders, as last season's and this
          season's may.
          <ul>
            <li>
              Spreadsheet, picture and project files made before the move name teams by their old numbers: import
              them with <b>Match teams by name</b> ticked (see below).
            </li>
            <li>
              A playoff team moved past the league's last one is no longer a playoff team: new playoffs started
              with it start as the last one instead. Check ROM says if the draws need changing.
            </li>
            <li>
              An emulator's battery save remembers things by team position (saved lines, and on the Genesis crowd
              records), so start a new save file after downloading.
            </li>
            <li>
              Not offered for NHL 94: EVO, which builds its own menus and playoffs, nor for ROMs whose logos,
              banners, photos or songs the editor cannot follow; the page says why. On the original SNES game, if
              replaced logos have already used up their room, the move may not fit, and the page says so.
            </li>
          </ul>
        </li>
      </ul>

      <h4 id="help-midi">Preparing a MIDI file for an organ song</h4>
      <p>
        Any ordinary MIDI file can be imported, but the game's organ is a simple instrument, so a file made for it
        sounds best. In short: a clear tune with a few chords under it, 10 to 30 seconds long.
      </p>
      <ul>
        <li>
          <b>The file:</b> a standard MIDI file (<code>.mid</code>), of the usual kinds, one track or several (format 0
          or 1), timed in beats, as music programs save them. A file timed in SMPTE frames, or holding several separate
          songs (format 2), is refused with a message saying so.
        </li>
        <li>
          <b>Length:</b> the game's own songs last 10 to 30 seconds, and that suits it best: a goal, a faceoff or the
          end of a period starts another song and stops the one playing. A longer song plays until then.
        </li>
        <li>
          <b>Notes at once:</b> the organ plays at most four in NHL 94 and on the SNES, seven in NHL '95. Where more sound at once, the highest are kept and the
          lowest cut short or left out, so keep the tune on top and the chords under it, and leave out pads, strings
          and other held notes that would crowd it. The message after importing says how many notes were affected.
        </li>
        <li>
          <b>Instruments:</b> every note is played on the organ, whatever instrument the file gives it. Drums (MIDI
          channel 10) are left out, as the organ has none.
        </li>
        <li>
          <b>Range:</b> notes too low or too high for the organ move up or down by octaves: on the Genesis the range is
          C0 to B6 (MIDI 12 to 95), in NHL '95 C1 to C6 (MIDI 24 to 84), on the SNES D1 to G5 (MIDI 26 to 79). A tune
          near middle C (MIDI 60) is safe on all three.
        </li>
        <li>
          <b>Timing:</b> tempo and its changes are followed. The game times notes in 60ths of a second, so very fast
          runs and trills may blur. The sustain pedal, pitch bends and other controls are ignored: give each note its
          full length in the file.
        </li>
        <li>
          <b>Loudness:</b> on the Genesis, a note's velocity sets its volume (the game's own songs use about 105 in
          MIDI terms); on the SNES every note plays at the game's own volume.
        </li>
        <li>
          <b>Name:</b> the song is named from the file's track name, or else from the file name, and the team pages
          show it by that.
        </li>
        <li>
          <b>Where to make one:</b> a free music notation program, such as MuseScore, can write out a tune from sheet
          music and save it as MIDI. <b>Export MIDI</b> gives any of the game's songs as a starting point, to change in
          such a program and import again.
        </li>
        <li>
          <b>Try it:</b> <b>Play</b> gives a rough idea in the browser (the console's organ sounds different), and
          the downloaded ROM in an emulator gives the real thing.
        </li>
      </ul>

      <h3 id="help-byname">Matching teams by name</h3>
      <p>
        Spreadsheet files, picture files and project files all say which team each thing belongs to by the team's
        place in the list. That is right when the files go back into the ROM they came from, or into one with the
        teams in the same order. Where a ROM lists the same teams in another order, tick{' '}
        <b>Match teams by name</b> on the page you are importing from, and each thing goes to the team of the same
        name wherever it is.
      </p>
      <ul>
        <li>
          <b>Spreadsheet files:</b> rows of the teams, players and lines tables are matched, by the Team name
          column, or by Location and Name in the teams table. The team number in a row is then ignored, and the
          Team column can even be left out. Because the name is what finds the team, this is not the way to rename
          one. If any row names a team the ROM does not have, nothing is imported and every such row is listed.
          Playoff draws already name their teams.
        </li>
        <li>
          <b>Picture files:</b> each file goes by the team name in the middle of its name. One whose team is not
          in the ROM is left out and listed, and the rest go in.
        </li>
        <li>
          <b>Project files:</b> every team has to find a team of its name, or nothing is opened. Playoff draws and
          league rules follow the teams.
        </li>
      </ul>
      <p>
        Names have to agree exactly, apart from capitals in spreadsheets. Where two teams share a name, as leagues
        of different years can, the number is used to tell them apart.
      </p>

      <h3 id="help-reset">Resetting changes</h3>
      <p>
        Reset buttons put one thing back to how it is in the ROM you opened and leave everything else you have
        done alone. A button is greyed out while its part is unchanged, so the buttons also show at a glance what
        you have altered.
      </p>
      <ul>
        <li>
          On a team's page: <strong>Reset names</strong>, <strong>Reset roster</strong> (the players, their order
          and attributes, and the forwards and goalie bytes), <strong>Reset lines</strong>,{' '}
          <strong>Reset home colours</strong> and <strong>Reset away colours</strong>.
        </li>
        <li>
          Under each logo and banner: <strong>Reset picture</strong>. Below them,{' '}
          <strong>Reset banner colours</strong>.
        </li>
        <li>
          At the top of a team's page: <strong>Reset whole team</strong>, which does all of the above for that
          team and no other.
        </li>
        <li>On the Rink colours page, one button each for the ice and the arena.</li>
        <li>On the Game settings page, one button for each section.</li>
      </ul>
      <p>
        "The ROM you opened" means the file as you opened it, even if you have downloaded your work since. A reset
        is an edit like any other, so Undo brings your changes back.
      </p>
      <p>
        Some things to know. Resetting a roster does not reset the lines, which name players by their place on the
        roster, so reset both if you changed both. If you moved a player to another team, resetting one of the two
        rosters leaves him on both teams or on neither; reset both rosters to put him back. A picture that several
        teams share is reset for all of them. Resetting a roster can need more room than is free if other teams
        have grown; the bytes free at the top will say so. Giving rosters or pictures more room is not something a reset
        undoes.
      </p>

      <h3 id="help-csv">Spreadsheet files</h3>
      <p>
        <b>Spreadsheet files</b> exports everything in the editor as {CSV_TABLES.length} tables that Excel and
        similar programs can open, and imports them again. Every table covers every team. There are two forms, holding
        the same tables:
      </p>
      <ul>
        <li>
          <b>An Excel workbook</b>: one .xlsx file named after the <b>Name</b> at the top of the page, with a sheet for
          each table. Keep the sheet names as they are. Sheets with other names, such as your own notes, are ignored.
        </li>
        <li>
          <b>CSV files</b>: one file for each table, each starting with the Name, for example{' '}
          <i>My_League_Season_10_players.csv</i>.
        </li>
      </ul>
      <table className="left">
        <tbody>
          {CSV_TABLES.map((table) => (
            <tr key={table.id}>
              <td>{table.id}</td>
              <td className="wrap">{table.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>To use the CSV files:</p>
      <ol>
        <li>
          Click <b>Export all {CSV_TABLES.length} files</b>, or <b>Export</b> beside one file. Your browser may ask
          once for permission to download several files.
        </li>
        <li>Edit the files and save them, keeping the CSV file type and the ending of each file's name.</li>
        <li>
          Click <b>Import files…</b> and choose one file or several together. They are applied in the right order
          whatever order you pick them in.
        </li>
      </ol>
      <ul>
        <li>
          Tick <b>List teams in alphabetical order</b> before exporting to have the teams, players and lines tables
          list the teams by name. Each row keeps its team number, so such a file imports just the same. To put the
          teams in that order in the ROM itself, use <b>Move teams</b> on the Game settings page.
        </li>
        <li>
          An import is all or nothing. If any row in any chosen file is wrong, nothing changes, and each problem is
          listed with its file and spreadsheet row number.
        </li>
        <li>
          In the players file, a team's whole roster is replaced by the rows listed for it. You can keep the rows in
          any order: the <b>Position</b> column (G, F or D) and the <b>Order</b> column decide the roster order, and
          the goalie, forward and defence counts are set from what you list. Attributes are the stored values, 0 to
          15.
        </li>
        <li>In the teams file, only the columns present are changed, and an empty cell keeps the current value.</li>
        <li>
          In the songs file, each team has a row and each of its six organ songs a column, holding the song's number,
          or 0 for Random. The songlist file says which song each number is: on the Genesis these are the forum
          list's numbers, 1 to 72 (in NHL '95 its own songs, 1 to 36); on the SNES they number the songs the ROM's song tables hold, so export the two
          files together, and again after putting a song in from a MIDI file. An empty cell keeps the song the team
          has. A league ROM whose song table has no room for its last teams gets the table moved to free space when
          one of them is given songs, as on the team page. Importing the songlist file changes nothing.
        </li>
        <li>
          Colours are written like <i>#24ffff</i> and are matched to the nearest colour the console can show.
        </li>
        <li>Importing a workbook follows the same rules, and problems are listed by sheet and row.</li>
        <li>
          Lines, playoff draws and menu choices are written by name. Where two share a name, a number is used
          instead, written like <i>#12</i> for a roster position.
        </li>
        <li>Columns the editor does not know, such as your own notes, are ignored. So are Team name, Overall and League value.</li>
        <li>Importing a set changes the Name box to that set's name.</li>
      </ul>
      <p>
        To build a ROM for a new season: open the base ROM, add roster space if the button is offered, import that
        season's files in one go, check the free space, and download.
      </p>

      <h3 id="help-project">Project files</h3>
      <p>
        A <b>project file</b> holds all your work without the ROM: every team, the colours, the game settings, the
        pictures you replaced (the splash screen and main menu background included), the organ songs you made from
        MIDI files, your free agents, and where you moved teams. Work the editor keeps only in the ROM itself (player
        photos, score logos, and on the SNES banner and photo colours) goes in as a patch of the
        finished ROM, made only for the copy of the ROM you opened. <b>Save project file</b> on the Project file page downloads it,
        named with the Name box at the top.
      </p>
      <p>Use one to:</p>
      <ul>
        <li>move your work to another computer or browser, where you open the ROM and then the project;</li>
        <li>keep a copy of a season as it stood, to come back to;</li>
        <li>pass your changes to someone who has the ROM themselves, without sending the ROM.</li>
      </ul>
      <p>
        <b>Open a project file</b> lays the project over the ROM as you opened it, replacing whatever you have done
        in the editor since; Undo brings that back. Any roster or picture room you had made is made again first. The
        ROM has to be the same kind the project was made with, with the same number of teams, but it need not be the
        very same file. Opened over the same copy, everything comes back exactly as it was. Opened over a different
        copy, the project's teams, colours and settings replace that copy's, and the pictures you had replaced are
        replaced there too, while pictures you had left alone stay as that copy has them; the work kept only in the
        ROM itself stays as that copy has it, and the page says so.
      </p>
      <p>
        Tick <b>Match teams by name</b> to put each team in the project where this ROM has a team of the same name,
        for a ROM that lists the same teams in another order. Playoff draws, league rules and anything else that
        points at a team go with it. Every team in the project has to find a team of its name, or nothing is
        opened and the page says which did not.
      </p>
      <p>
        If something in the file does not fit the ROM, the rest still opens and the page says what was left out. A
        project file is not a ROM and cannot be played; download the ROM or a patch for that.
      </p>

      <h3 id="help-league">The league at a glance</h3>
      <p>
        The <b>League</b> page looks across every team.
      </p>
      <ul>
        <li>
          <b>Find a player</b> searches all rosters as you type. Part of a name is enough, and several words can be
          in any order. Click a team in the results to go to it, or choose a team under <b>Move to</b> to move a
          skater there, as on the team pages: he goes after its last forward or defenceman, and both teams' lines are
          kept in step. Goalies move by copying and pasting on the team pages.
        </li>
        <li>
          <b>How the teams compare</b> is a table of overall ratings, as the game shows them, averaged for each
          team. <b>First line</b> is the five skaters on the NLC line, the one that plays when line changes are
          off, and <b>Its goalie</b> is that line's goalie; for a league that plays without line changes these two
          numbers are the team. The rest cover the whole roster. Click a heading to sort by it. Numbers well above
          or below the league average are coloured, to pick out stacked and thin teams. <b>Overall</b> is the team's
          overall from its page: every skater on the Sc1, Sc2 and Chk lines once, and the NLC goalie. For a league that plays
          with line changes, <b>Show every line</b> adds a column for each of the other lines (the scoring and
          checking lines, and the power play and penalty kill units), each the average of its five skaters; point
          at a number to see its forwards and its defence pair apart.
        </li>
        <li>
          <b>Strength</b> (Genesis): how strong a team should play, from the NHL94 Match Viewer project's study of
          the Classic leagues' results. It is 71% the average league value of the team's four best forwards, 15% its
          three best defencemen and 14% its best goalie, so on the same 0–99 scale as the league value (see{' '}
          <b>LV</b> under the team pages). Built only on the best players, it does not depend on how the lines are
          set. It explains about 69% of the differences in strength between the leagues' teams, and 50% of a team
          left out of the fit, where the game's Overall explains almost none of a team it has not seen; so it is
          the better measure of whether a league is balanced. <b>League balance</b> can be measured by it too. It
          is for the Genesis game with its own ratings; the SNES teams' strengths repeat too poorly from season to
          season to fit one.
        </li>
        <li>
          <b>Two teams side by side</b> puts any two teams' ratings next to each other: the overall, every line,
          the starting goalie, the forwards, the defence and the best goalie, with the higher of each marked and the
          difference between them. Use it to preview a playoff series, or to see what a trade did to two teams.
        </li>
        <li>
          <b>League balance</b> ranks the teams by one rating (the overall, the first line for a league without line
          changes, or all the skaters), with each team's distance from the league average drawn as a bar. Above it
          are the average, how far the best team is above the weakest, and the standard deviation: the smaller these
          are, the more even the league. Teams more than one standard deviation from the average are marked. The
          original game's All-Star teams are left out unless you tick <b>Count the All-Star teams</b>.
        </li>
        <li>
          <b>Home and away</b> shows how the teams' Home and Away ratings differ (the home team adds its Home rating,
          and the away team takes its Away rating off, five of each player's ratings as he comes on the ice), and
          sets one pair for every team: the same advantage in every game, or 0 and 0 for none. Undo takes it back.
        </li>
        <li>
          <b>Lines for every team</b> builds every team's lines from the players' ratings, as a team page's Build all
          lines does (see Lines), or only each team's broken lines, and lists the teams that have any. Undo takes it
          back.
        </li>
      </ul>

      <h3 id="help-trade">Trades and free agents</h3>
      <p>
        The <b>Trade</b> page exchanges players between two sides. Choose a team for each, tick the players each
        gives up, and the page shows what the trade would do before you make it: each team's size, the rating of
        its first line and of its skaters, and its best goalie, before and after. Either side can give nothing,
        which makes it a plain move. Each player is listed with all his attributes, as on his team's page, so you
        can weigh one against another; untick <b>Show attributes</b> for a shorter list. On a narrow window the two
        sides sit one above the other.
      </p>
      <ul>
        <li>Skaters keep their role: a forward arrives among the other team's forwards, a defenceman at the end.</li>
        <li>
          Goalies change places one for one, each taking the other's spot on the roster, because the game needs a
          team's goalies to stay where they are. A goalie cannot be traded for a skater.
        </li>
        <li>
          A team has to keep at least 5 players and can hold 26. Two full rosters can still trade one for one.
        </li>
        <li>
          Where a player who leaves was on his team's lines, another player is put in his place and the page says
          how many positions that touched, so you can look the lines over.
        </li>
        <li>One Undo takes back one trade.</li>
      </ul>
      <p>
        For a quick release or signing there is no need to leave a team's page: tick players and press{' '}
        <b>Release ticked</b>, or choose a free agent and press <b>Sign</b>. To sign a goalie, tick the goalie he
        is to replace first.
      </p>
      <p>
        <b>Free agents</b> are players you are holding on no team. Choose Free agents as one side to release a
        player to them or to sign one from them; a goalie can be swapped with a free-agent goalie. They are part of
        your work, kept in this browser and in a project file, but they are <b>not in the ROM</b>: a downloaded ROM
        has only the players on teams, and Check ROM reminds you when some are waiting.
      </p>
      <p>
        They do have a sheet in the spreadsheet files, <b>freeagents</b>, with the same columns as the players
        sheet less the team. That sheet is the whole list: importing it replaces the free agents you had, so add
        rows to bring players in and delete rows to drop them. It is a way to prepare a draft pool in Excel and
        then sign players from it on the Trade page.
      </p>

      <h3 id="help-bulk">Bulk changes</h3>
      <p>
        <b>Bulk changes</b> alters one attribute for many players at once: raise or lower it by a number of steps,
        set it, cap it, or give it a floor. Choose skaters, forwards, defencemen or goalies, on every team or one,
        and optionally only players within a range of overall rating.
      </p>
      <p>
        The page lists everyone who would change, with the attribute and overall rating before and after, and
        nothing happens until you press <b>Apply</b>. Players already at the end of a range are left out, since
        they would not change. One Undo takes the whole change back.
      </p>
      <p>
        For weight there is one more choice, <b>Convert from another era's weights</b>. ROMs can be set up so that
        the lightest weight stands for anything from 102 to 152 pounds, to suit the year they represent. If
        players' weights were set for a different base from this ROM's, as when a roster comes in by spreadsheet
        from an older season, choose the base they were set for and each player is moved to the weight here
        nearest the pounds he had. Weights go in steps of 8 pounds, so the nearest can be up to 4 pounds out.
        Import a team does this by itself when the two ROMs differ.
      </p>
      <p>
        Ratings have seven steps, which the game shows as ranges such as 81-98, so "raise by 1" moves a player up
        one range. Hand, fighting and the goalie values the game does not use are not offered.
      </p>

      <h3 id="help-hacks">Hacks</h3>
      <p>
        The <b>Hacks</b> page changes how the game itself plays, where every other page changes its teams and
        settings. Each hack is explained beside its setting, with where it came from: smozoma's program smozROM
        (built in with his permission), guides posted on the NHL94 forums, and the NHL94 Match Viewer project, which
        found most of the fixes and tested every hack marked as tested in the game. The page shows what the ROM has
        now, which for a league ROM is often several hacks already. Set what you want and press <b>Apply</b>. Nothing
        changes until you do, the box above the button lists exactly what will, and one Undo takes it all back.
      </p>
      <p>
        The hacks are in groups, the same on both systems and on the hack sheets: <b>Fixes</b> for the game's bugs,{' '}
        <b>Statistics</b>, <b>Ratings</b>, <b>Rules</b>, <b>Energy and injury risk</b>, <b>Goalies</b>,{' '}
        <b>Skating and the puck</b>, <b>Edit Lines and controls</b>, <b>Looks and screens</b>, and on the Genesis{' '}
        <b>Legacy hacks</b> kept for league ROMs that have them. The links at the top of the page jump to each.
      </p>
      <p>
        <b>Turn on the recommended fixes</b>, at the top of the page (on the SNES Hacks page too), sets the bug fixes
        recommended for every league; press Apply to make it so.
      </p>
      <ul>
        <li>
          On the Genesis: the weight bug and C-then-B fix (taking out smozoma's legacy weight bug fix), the
          second-assist, one-timer assist and regained-puck assist fixes, the Aggression, power play and penalty
          kill, comeback bonus, rocket pass and runaway speed fixes, both penalty shot fixes, counting stick
          deflections as shots, the one-timer open net, repeated checks and computer forwards' awareness fixes,
          B-checks with penalties off tripping as with penalties on, and the improved three stars, for line changes on
          or off as the ROM's main menu starts (an improved version already chosen is kept).
        </li>
        <li>
          On the SNES: the power play and penalty kill, comeback bonus, penalty shot, extra attacker, second-assist
          and regained-puck assist fixes, counting stick deflections as shots, defence control on from the start, and
          the B while checking or bursting, L and R while busy, one-timer that never fires, shot that never fires and
          computer forwards' awareness fixes, no icing within the crease, the goalie poke check reaching the ice, the
          bodycheck counts and their column in Player Stats, and skipping both intros.
        </li>
        <li>
          Left for each league to choose: the faceoff spot fix (a choice between eras), every option, and three
          fixes leagues may not want: the Genesis pulled-goalie sniping fix (a quirk some leagues like), the SNES hot
          and cold bug fix (players play lower than people are used to) and the SNES Y button fix (a habit people
          expect).
        </li>
      </ul>
      <p>
        <b>Copy this ROM's hacks for Discord</b> copies a Discord post for the league's owners listing every hack
        this ROM has (everything that differs from the original game), each explained in plain words, and shows it
        below the button. Discord allows 2,000 characters a message, so a long list comes as several messages, each
        with its own copy button. Untick <b>explain each hack</b> for just the names.{' '}
        <b>Download hack sheet</b> saves a page explaining, in plain words for the owners, what each of those hacks
        means for how the game plays, to open, print or share. If the ROM has score box logos, the post and the sheet
        say so too, under Pictures.
      </p>
      <p>
        <b>Copy hacks from another ROM…</b>, beside Apply, sets every choice on the page to match another ROM, for
        a league that wants the same hacks in all its ROMs (Genesis to Genesis, SNES to SNES). The other ROM is only
        read. The list above Apply then shows what would change; press Apply to make it so. A hack that either ROM
        has replaced with other code, or has in an old version that cannot be added again, is left as this ROM has
        it, and listed below the buttons.
      </p>
      <p>
        If a ROM has an earlier version of a hack (NOSE4Web's own from before a fix, or NHL94SNESVault's), the hack
        shows as on, with <b>This ROM has an earlier version of it</b> and what changed. Its button puts in NOSE4Web's
        current version, leaving every other hack as it is; Undo puts the earlier one back. A hack shown greyed out
        is different: the ROM has other changes in that spot, so NOSE4Web leaves it alone. If you think it is a
        version NOSE4Web should know, send the ROM to whoever looks after NOSE4Web.
      </p>
      <ul>
        <li>
          <b>Weight bug and C-then-B fix</b>: fixes the weight bug, where a light skater you control knocks down
          anyone two or more weight steps heavier, and the C-then-B check, where pressing C then B just before
          contact lets the computer judge the hit for you. With the fix every check is judged the same fair way: the
          heavier checker does better, and switching away gains nothing. Your checks against players your own weight
          or lighter get easier than they were. Leave smozoma's legacy weight bug fix off with it. An earlier version
          of this fix, still recognised in ROMs that have it, gave the computer's checkers the weight bug too. Found
          by the NHL94 Match Viewer project.
        </li>
        <li>
          <b>Second-assist bug fix</b> (Genesis and SNES): gives the assist the original game leaves out when two
          players pass back and forth before a goal.
        </li>
        <li>
          <b>Count stick deflections as shots</b> (with the statistics, Genesis and SNES): in the original game a
          hard low shot the goalie knocks away with his stick does not count as a shot on goal, so shots along the
          ice go missing from the totals. With this on it counts, for the shooter and his team and against the
          goalie: about 2 more shots on goal a game in recorded league games. On the SNES hard high shots knocked
          away by the stick or glove count too: up to about 4 more a game. Only the statistics change.
        </li>
        <li>
          <b>Bodycheck statistics:</b> counts each player's checks and shows them in Player Stats as Chk, in place
          of penalty minutes.
        </li>
        <li>
          <b>Plus-minus statistic:</b> kept for every player but not shown by the game. It is there for tools that
          read save states.
        </li>
        <li>
          <b>Time on ice in Player Stats</b> (Genesis): the game counts each player's time on ice but never shows it.
          This adds a Time On Ice page to Player Stats, right after Penalty Minutes, showing G, A, Pts and the time.
          The other pages are unchanged. On the SNES, <b>time on ice for each player</b> counts it for tools that
          read save states (McMarkis's builds count their own).
        </li>
        <li>
          <b>Three stars:</b> a fuller way of choosing them, in one version for playing with line changes off and
          one for line changes on. It counts bodychecks, so it goes with bodycheck statistics.
        </li>
        <li>
          <b>Rating scale:</b> ratings from 0 to 15 in place of 0 to 6, with overall rating formulas made for
          them.
        </li>
        <li>
          <b>Hot and cold bonuses:</b> what becomes of the bonuses that make a player hot or cold for a game.
          They are explained below.
        </li>
        <li>
          <b>Base weight:</b> the weight a player's lowest weight value stands for, from 102 to 152 pounds. Type a
          season's year to get the weight smozROM suggests for it.
        </li>
      </ul>
      <p>
        <b>Hot and cold bonuses.</b> Before each game, the game makes every player a little hot or cold: a small
        bonus or penalty on top of the ratings you set, which are not changed. It keeps two sets of these. One is
        used on the ice, where a player has a single bonus for all his attributes, so he is hot or cold in
        everything at once. The other is shown in the ratings on the Edit Lines screen, with a separate bonus for
        each attribute. The two do not agree, so in the original game Edit Lines does not tell you who is really
        hot. There are five choices:
      </p>
      <ul>
        <li>
          <b>As the original game has them:</b> the two sets stay as they are, and you have to feel who is hot.
        </li>
        <li>
          <b>No bonuses:</b> nobody is hot or cold. Every player plays to his ratings every game, and Edit Lines
          shows the plain ratings. This suits a league that wants an even contest.
        </li>
        <li>
          <b>Bonuses not shown in Edit Lines:</b> players are still hot or cold on the ice, but Edit Lines shows
          the plain ratings. Nothing misleads you, but nothing tells you who is hot either.
        </li>
        <li>
          <b>Players match Edit Lines:</b> on the ice, each player gets the bonuses Edit Lines shows. What you
          see is what you get, and a player can be hot in one attribute and cold in another.
        </li>
        <li>
          <b>Edit Lines matches players:</b> Edit Lines shows the bonus each player really has. What you see is
          what you get, and a player is hot or cold in everything at once.
        </li>
      </ul>
      <p>
        None of the choices fixes the ratings the announcer gives before a game. If your league is happy with
        how its ROM plays now, leave this as the ROM has it.
      </p>
      <p>
        Changing the <b>rating scale</b> converts every player's ratings so that each plays as he did: 0, 1, 2, 3,
        4, 5, 6 become 0, 3, 5, 8, 10, 13, 15, and going back converts them again. Changing the{' '}
        <b>base weight</b> moves each player to the step nearest the pounds he weighs, which can be up to 4 pounds
        out. Free agents and a season's starting point are converted with the teams, and the Reset buttons go back
        to the opened ROM's players on the new scale. Overall ratings read differently on the two scales.
      </p>
      <ul>
        <li>The Changes page and the change report list hacks you have changed under <b>Hacks</b>.</li>
        <li>
          A project file carries the ROM's hacks. Opened over a ROM without them, it puts them in first and says
          so.
        </li>
        <li>
          Import a team converts ratings and weights when the other ROM is on a different scale or base weight.
        </li>
        <li>
          If a ROM has been changed where a hack goes, in a way the editor does not recognise, that hack is greyed
          out and left exactly as it is. The others can still be changed.
        </li>
        <li>
          Some league ROMs carry an earlier version of the bodycheck statistics, or an earlier, simpler weight bug
          fix. Each is kept as it is unless you choose On, which replaces it with the current version, or Off.
        </li>
        <li>
          With 0 to 15 ratings, "Edit Lines matches players" is not offered, as smozROM's version of that
          combination seems to be wrong. A ROM that already has it is shown as having it.
        </li>
        <li>The page is there for the original game and the 30-team ROM. It is not offered for NHL 94: EVO.</li>
      </ul>
      <p>
        <b>Play.</b> The last group changes how the game plays. Most are numbers the game uses, so change them a
        little at a time and try the result.
      </p>
      <ul>
        <li>
          <b>Power play and penalty kill fix</b> (in with the fixes): because of a bug, the game uses each team's
          power play and penalty kill ratings the wrong way round. The fix makes the game use them as intended, so
          existing rosters play as their makers meant, and the team page shows them that way round. A league that
          set the two by what the editor showed before should check them once the fix is in.
        </li>
        <li>
          <b>Aggression bug fix</b> and <b>comeback bonus fix</b> (in with the fixes): two bugs found by the NHL94
          Match Viewer project. In the original game Aggression wraps round, so a 4 plays like a 1, and a 6 or a 3
          draws the most penalties; the fix makes it rise with the rating. It also affects goalies, whose glove
          rating GvL is stored in the same place: with the fix a goalie needs about 5 for the reaching glove save.
          The comeback bonus, for a team tied or behind in the third period, comes in the first half of the period
          when it is meant for the second; the fix puts it in the second.
        </li>
        <li>
          <b>Rocket pass fix</b> (in with the fixes, Genesis only): because of a rounding error, many passes go
          nearly twice as fast as the passer's rating allows, and a pass to a teammate skating away close by can
          go faster still. With the fix, passes go at the speed the Passing rating sets. The SNES game never had the bug.
        </li>
        <li>
          <b>One-timer open net fix</b> (Genesis only, among the recommended fixes): the game aims one-timers
          itself. When the goalie is out of position, it aims just under the crossbar, so many open-net one-timers
          sail over. The fix aims them at the middle of the net, as the game does with the goalie pulled; the
          computer's shots get the same aim. Tested in the game by the NHL94 Match Viewer project: open-net
          one-timers went in 86% of the time with it, 56% without, and those with the goalie in position were
          unchanged. On the SNES one-timers already go where the stick aims.
        </li>
        <li>
          <b>Tied regular-season games</b> (Genesis): the original game ends a regular-season game still tied after
          overtime as a tie, while a playoff game plays more overtime until a goal. <b>Overtime until a goal</b>{' '}
          makes the regular season the same, each overtime as long as the regular season's (10:00); a game can run
          long, but never ends tied. <b>A shootout</b> settles a game still tied after overtime with the game's own
          shootout: five shooters a side, then one each until a team is ahead. The winners get one goal more on the
          scoreboard, and the game ends as usual, with its stats and Stars of the Game. <b>A shootout after period
          3</b> does the same straight after regulation, with no overtime. The playoffs are unchanged. All three
          tested in the game by the NHL94 Match Viewer project.
        </li>
        <li>
          <b>Penalty time</b> (both systems): how many seconds a player spends in the box for each penalty minute,
          60 in the original game. Each penalty keeps its minutes (set under Rule messages on the Game settings
          page), so at 30 a 2-minute minor lasts 1:00 and a major 2:30, to suit short periods. The penalty minutes in
          the statistics stay as they are.
        </li>
        <li>
          <b>Fighting penalty time</b> (both systems): how long a fight keeps each fighter in the box, in seconds of
          the game clock, whatever the penalty time; Off leaves a fight at its 5 minutes, timed by the penalty time. Both
          fighters get the same, so the teams stay at full strength. On the SNES it works with McMarkis's fighting
          builds and NOSE4Web's own fighting. Tested in the game by the NHL94 Match Viewer project.
        </li>
        <li>
          <b>Fighting</b> (Genesis): chaos's fighting patch, version 1.01, which brings NHLPA 93's fights into the
          game. Choose the main menu's starting setting for its new <b>Fighting</b> line: Off, On, or On - Arcade
          Mode (more fights); players can change it on the menu as usual. A fight needs enough hard checks first, and
          players whose fighting ratings (the second half of the H/F column) are high enough; in the original game
          few are, so a league that wants fights raises some. chaos's forum post "How fighting works in the NHL94
          fighting patch" explains it. It makes the ROM 3 MB, and saving still works; Genesis Plus GX plays it. It
          works on league ROMs too, keeping the league's main menu with the Fighting line added (chaos's own title
          screen, credits and player ratings are not copied). Head bleeding still works with it. Made by chaos, with
          McMarkis and AbdulBCRT (github.com/Chaos81/nhl94-patches, MIT licence, Copyright (c) 2025 Chaos81). Tested
          in the game by the NHL94 Match Viewer project.
        </li>
        <li>
          <b>Faceoff spot fix</b> (in with the fixes, on the Genesis and the SNES Hacks pages): faceoffs as today's
          NHL rules have them. Since 2007–08 every NHL faceoff has been on one of the nine dots. The game follows the
          older rules, so many faceoffs (about 1 in 8 in recorded Genesis games, mostly after penalties) are in open
          ice, level with the nearest dots. With the fix every faceoff is on a dot: after a goal at centre; after a
          penalty in the offending team's end, on the side the puck was; otherwise at the nearest dot on the puck's
          side. A puck shot out of play is faced off where the player who last touched it was. When both teams take
          penalties the faceoff still moves out to the neutral zone, as before. Leave it off for the game's own
          faceoffs, closer to the rules of its day.
        </li>
        <li>
          <b>Runaway speed fix</b> (in with the fixes, Genesis only): now and then a skater you control shoots off
          at up to twice top speed and slides out of control for a second or two. It happens when you take over a
          skater while a pass is coming to him, when a player gets up from a fall into the boards, and when a
          one-timer misses the puck (about 8 times a game in recorded games). The fix stops it in all three cases.
          Computer skaters still glide onto passes, and a skater you take over with a pass coming is now steered by
          you. Found by the NHL94 Match Viewer project. The SNES game does not have this bug.
        </li>
        <li>
          <b>Penalty shot table fix</b> (in with the fixes, Genesis only): a foul on a skater on a breakaway can give
          a penalty shot, but the game mixes up the fouls, so every penalty shot is called and recorded as the wrong
          one (charging as slashing, slashing as roughing, and so on). The fix gives each foul its own penalty shot.
          Which fouls give penalty shots does not change: holding has no penalty shot in the game, and interference
          is never called on the puck carrier.
        </li>
        <li>
          <b>Penalty shot fixes</b> (in with the fixes, Genesis only): a penalty shot stopped by a whistle it does
          not expect (the puck over the glass, the net knocked off) is taken all over again; with the fix the game
          goes on to a faceoff. And a puck shot over the glass just as the penalty shot is awarded can float through
          the net and the boards during the shot; with the fix it plays normally. Shootouts are unaffected.
        </li>
        <li>
          <b>Computer goalie pull fix</b> (in with the fixes, Genesis only): in the last minute of the third period
          the computer pulls its goalie only when exactly two goals behind, never one. With the fix it pulls him when
          one or two behind. It changes how the computer plays late in close games. While its goalie is out its
          shots in range go exactly where they are aimed, as anyone's do with the goalie pulled, unless the
          pulled-goalie sniping fix is on too.
        </li>
        <li>
          <b>Pulled-goalie sniping fix</b> (in with the fixes, Genesis only; an option, a matter of taste, since some
          leagues like the sniping): whenever a team's own goalie is off the ice, on a delayed penalty or pulled late
          in a game, the original game makes every one of its shots in range go exactly where it is aimed. With the
          fix those shots are no more accurate than usual. Shots at an empty net already are. The SNES does not have
          this bug.
        </li>
        <li>
          <b>Computer forwards' awareness fix</b> (with the fixes, Genesis and SNES; recommended on both): computer
          forwards on offence react at the pace of their Defensive Awareness when it should be their Offensive
          Awareness. With this on they use Offensive. A small change for most players.
        </li>
        <li>
          <b>Crowd bonus fix</b> (with the fixes, Genesis only; an option): the crowd's boost to skaters (+2 Agility,
          +2 Speed and more) is meant to come only when the crowd meter is past its record, but because of a bug it
          is on all the time. With this on it follows the meter, which in recorded games is past its record about
          three quarters of the time.
        </li>
        <li>
          <b>Close the five-hole blind ring</b> (with the fixes, Genesis only; an option, a matter of taste): in the
          butterfly and some kick saves there is a gap where a flat puck touches neither the goalie's stick nor his
          body, and slides through his legs. With this on his body stops it as anywhere else. Small overall (about
          0.3% fewer expected goals in recorded games), but it accounts for some five-hole goals (3 of 218 recorded).
        </li>
        <li>
          <b>Goalie hold time:</b> seconds a goalie may hold the puck before the whistle, 2.33 in the original
          game. 0 means no whistle.
        </li>
        <li>
          <b>Goalie range to each side</b> and <b>up the ice:</b> how far a goalie you control can roam without the
          puck. The original game has 36 to each side and 231 from centre ice; several league ROMs have 40 and 224, a
          little more room each way. For scale, about 3 units make a foot: the rink is about 260 wide, the goal line
          is 268 from centre ice and the blue line about 88.
        </li>
        <li>
          <b>Goalie whistle line:</b> how far from centre ice a goalie you control may skate before play is
          whistled, 170 in the original game. A smaller number lets him go farther. Without the puck he is kept in
          his range, so in practice it is the line he may carry the puck to.
        </li>
        <li>
          <b>Unlimited stamina</b>, <b>energy lost on the ice</b> and <b>energy gained on the bench:</b> for games
          with line changes on. The original game takes 33 and gives back 9.
        </li>
        <li>
          <b>Speed burst:</b> the push the C button gives. 0 keeps the original game's, which is 32 for a fresh
          player and less for a tired one; any other number is the push for everybody.
        </li>
        <li>
          <b>Stopping and turning:</b> how quickly a skater stops when he reverses, 150 in the original game.
        </li>
        <li>
          <b>Real-time clock:</b> the game clock, penalty clock and penalty shot clock count real seconds; in the
          original game they run two and a half times as fast. Periods then last as long as they say, so set
          shorter ones in Game settings. People who have played this way report that the penalty clock can skip
          now and then.
        </li>
      </ul>
      <p>The other options, each explained in full beside its setting:</p>
      <ul>
        <li>
          <b>One-timer assist fix</b> and <b>regained-puck assist fix</b> (in with the fixes): assists the original
          game leaves out, after a one-timer and when a player wins the puck back himself and passes to the scorer.
        </li>
        <li>
          <b>Injuries</b>: as in the original game; <b>never</b> (a hit is only a fall); <b>the penalty, but no
          injury</b> (the hit is still called and the player lies down about ten seconds before he skates on); every
          injury lasting the period, or the whole game; or <b>a long fall instead</b> (a hit that would injure keeps
          the player down about 5 seconds, then he plays on, with no injury and no penalty; not with head
          bleeding). <b>Hot and cold range</b>: how far hot and cold swing a rating. <b>No icing</b>.{' '}
          <b>Hybrid icing</b>: decided as the puck crosses the goal line, by which team's nearest skater is closer to
          the end-zone faceoff dots, as the NHL plays it (the original game plays touch icing).{' '}
          <b>The injured sit out the shootout</b>: with a shootout for tied regular-season games, a skater injured for
          the game takes no attempt; the next on the list shoots (if all five are out, the listed player shoots
          anyway).{' '}
          <b>3 on 3 overtime</b>: each team's goalie and its line's LW, C and RD play overtime, in the regular season
          or in every overtime; a penalty gives the other team an extra skater (4 on 3, 5 on 3), and when it ends the
          teams play 4 on 4 until the next whistle, as in the NHL (on the SNES too). <b>Calls during a delayed
          penalty</b>: while one team has a penalty coming, the other can be called too (in the original Genesis game
          it cannot; the SNES game never had this bug).{' '}
          <b>B-checks with penalties off</b>: they trip as with penalties on. <b>Goalie control delay</b>: how long B
          is held before you take the goalie.
        </li>
        <li>
          <b>Edit Lines for fewer skaters</b>: for 1-on-1, 2-on-2 or 3-on-3 ROMs, so the game's Edit Lines shows only
          the positions used and no longer crashes. <b>Any skater at any position in Edit Lines</b>: the game's own
          line editor offers every skater for every position, and saved lines keep them.
        </li>
        <li>
          <b>Extra period length with its own overtime</b>: one ROM for two kinds of regular-season game. The main
          menu's Period Length gets an extra choice (set its length and text on the Game settings page), and games
          played at it get an overtime of their own, such as 99 minutes, as good as until a goal; the other lengths
          and the playoffs are as before. A league needing both no longer needs a separate ROM.
        </li>
        <li>
          <b>Hits and energy</b>, for games with line changes on: <b>energy lost when knocked down</b> and{' '}
          <b>when held or hooked</b>; <b>injury risk added by each knockdown</b>, with the most it can add; and{' '}
          <b>skating costs no energy</b> and the <b>energy a C-button burst costs</b>. The <b>Energy from hits
          only</b> button sets them so that only hits tire a player: three knockdowns leave a skater at the slowest
          speed there is, and he gets his energy back on the bench. Beside it, the table <b>Knockdowns to empty a
          skater</b> gives the costs for 2 to 10 knockdowns, each row with a button that sets both; press Energy from
          hits only first for hits alone. Any knockdown counts, whoever makes it (a poke check or a goalie included),
          but not a bump he stays up from, the puck, or a hit after the whistle. Energy never goes below 0.
        </li>
        <li>
          <b>Puck friction</b>: how quickly a loose puck slows down.
        </li>
        <li>
          <b>Looks and screens</b>: <b>puck colours</b> and <b>net colours</b> (drawn in the crowd's or a team's
          colours), <b>the fan in green</b> (his missing arm and leg put back), <b>Ron Barr's pick every game</b> (he
          names the team that came out hotter before every game, not only when the gap is wide) or <b>by a coin
          flip</b> (a team named every game at random, whatever its form), and the <b>intro
          screen wait</b>.
        </li>
      </ul>
      <p>
        <b>Legacy hacks</b>, the last group before Apply, are kept for league ROMs that already have them; a better fix
        has replaced each one.
      </p>
      <ul>
        <li>
          <b>smozoma's weight bug fix (legacy):</b> smozoma's fix, from smozROM. The NHL94 Match Viewer project has
          since found that it gets the cause wrong: in the original game the heavier checker is meant to do better,
          and the bug only affects checks by a player a person controls. smozoma's fix swaps the weights round, so
          the computer's checkers then do better the lighter they are, and it counts both players' checking ratings.
          For the weight bug, use the weight bug and C-then-B fix instead. If a league keeps this one, keep checking
          ratings near the original game's: most forwards 2 or 3 out of 6, most defencemen 2 to 4, very few players
          5 or 6.
        </li>
      </ul>
      <p>
        For the choices smozROM offers, the editor makes exactly the same ROM smozROM would. smozROM always puts in
        the second-assist fix and the plus-minus statistic, and adds bodycheck statistics with the weight bug fix;
        here each can be chosen by itself. Whatever you choose, play a game on the hacked ROM before a league does.
      </p>

      <h3 id="help-importteam">Importing a team</h3>
      <p>
        <b>Import a team</b> brings one team in from another ROM to replace a team in the editor. Use it when an
        owner sends back their own edited ROM, or to carry a team over from an earlier season. Choose the other
        ROM, the team to take, the team to replace, and which parts to bring: names, roster and lines, colours,
        and logos and banners.
      </p>
      <ul>
        <li>The roster and lines come together, because lines name players by their place on the roster.</li>
        <li>
          The team's six ratings come with the roster. If only one of the two ROMs has the power play and penalty
          kill fix, those two ratings are swapped so that the team plays as it did; the notes say so.
        </li>
        <li>
          The two ROMs can be different kinds, such as the original game and the 30-team ROM. The teams do not have
          to be in the same place in both.
        </li>
        <li>
          Each picture is brought in separately, and the page says which made it. One that needs more room than
          the ROM has is left alone; give the logos and banners more room on any team's page and import again.
          Banners that every team shares in this ROM are also left alone.
        </li>
        <li>The centre-ice logo is drawn with the home colours, so bring the colours with it.</li>
        <li>
          On the SNES, <b>Logos</b> brings the team logo, the centre ice logo and the score logo. The centre ice logo
          is fitted to the colours this ROM uses for it (or brings its own colours, in builds where each team has
          its own centre ice colours); teams that share it here get it too. If the other ROM shows the team's
          letters in the score box, so will this one, and a ROM without score logos leaves this one's alone.
        </li>
        <li>A bigger roster needs more room; the bytes free at the top of the page show whether it fits.</li>
      </ul>

      <h3 id="help-check">Checking a ROM</h3>
      <p>
        <b>Check ROM</b> looks over everything in the editor and lists what it finds in two groups. It updates as you
        work, and a number beside its name in the list on the left counts the first group.
      </p>
      <ul>
        <li>
          <b>Likely to cause trouble in the game</b>: a line position with no player, a goalie in a skater's position,
          a player with no name, a jersey number that is not 00 to 99, a playoff draw naming a team that does not
          exist, a menu item starting on a choice that does not exist, or team data too large to fit.
        </li>
        <li>
          <b>Unusual, and worth a look</b>: a line without the first goalie in goal, a player twice on one line, two
          players sharing a jersey number, an attribute outside its normal range, a name with no space, a team
          twice in one playoff draw, a team the menu offers that no playoff draw has (starting new playoffs with it
          freezes the game), playoff draws with teams the menu does not offer, or a main menu starting team the menu
          does not offer.
        </li>
      </ul>
      <p>
        Click a team's name in the list to go to it. Nothing here stops you downloading, and it is worth a look
        after importing spreadsheet files.
      </p>

      <p>
        Check ROM also notes strips that would be hard to tell apart in a game. A visiting team wears its away
        strip, so a team's home strip is compared with every other team's away strip, by the colour of the jersey
        and of the pants; and a strip that is close to the colour of the ice all over is noted too. These are notes,
        not problems: the game plays the same, but the players are harder to follow.
      </p>

      <p>
        A team's page can also save its <b>roster card</b>: the roster as a picture, with every player's number,
        position, overall and attributes under the team's name and colours, sized to post where the league can see
        it.
      </p>

      <h3 id="help-rules">Your league's rules</h3>
      <p>
        On the <b>Check ROM</b> page, the box marked <b>Your league's rules</b> opens to let you set limits that
        your league keeps to and the game itself does not care about. Fill in the ones you want and leave the rest
        empty. Every team is then checked against
        them as you work, and anything that breaks one is listed under <b>Against your league's rules</b>, with the
        team to click through to. The number beside Check ROM in the list counts these along with the problems.
      </p>
      <ul>
        <li>
          <b>Size and make-up:</b> the fewest and most players, goalies, forwards and defencemen a team may have.
        </li>
        <li>
          <b>Ratings:</b> the highest overall any one player may have; the highest a first line may average, which
          is the limit that matters most where a league plays without line changes; the highest a team's skaters
          may average; and the most a team's overall ratings may add up to, in the manner of a salary cap.
        </li>
        <li>
          <b>No player on more than one team.</b> Players are told apart by name, ignoring capitals and stray
          spaces. A free agent who is also on a team is caught as well.
        </li>
        <li>
          <b>No two players on a team with the same number.</b>
        </li>
        <li>
          <b>No skater on more than one of Sc1, Sc2 and Chk</b>, for a league that plays with line changes on. Those
          three lines take turns, so a skater on two of them plays two shifts in three and rests less, which counts
          for more with the energy options on the Hacks page. The goalie and the extra attacker are left out, and so
          are the power play and penalty kill lines, which come on only for those.
        </li>
        <li>
          <b>Teams the rules do not apply to:</b> tick any to leave out, such as All Stars teams or a team used as
          a pool of spare players.
        </li>
      </ul>
      <p>
        The rules never stop you downloading, and they are not written to the ROM. They are kept with your work in
        this browser and in a project file, so a league's rules can be set once and carried from season to season.
        The original game breaks some of them as it comes: its two new teams' players are also on the teams they
        were drafted from, and its stars are on the All Stars teams too.
      </p>

      <h3 id="help-changes">Changes and seasons</h3>
      <p>
        The <b>Changes</b> page lists everything you have changed, in plain words, and keeps itself up to date as
        you work. The number beside it in the list counts the changes. It is worked out from where things stand,
        not from what you clicked, so something changed and changed back is not listed, and a renamed player is one
        change however many lines he is on. <b>Download report</b> and <b>Copy report</b> give you the list as text
        to pass on. Logos and banners are not listed.
      </p>
      <p>
        The list can run from either of two starting points: <b>since this ROM was opened</b>, or{' '}
        <b>since the season began</b>.
      </p>
      <p>
        <b>Start a new season</b>, at the foot of the page, marks the teams as they stand as a season's starting
        point. It gives the work the new season's name, counting up from the old one, and can first save a project
        file of the season just ended and let the free agents go. From then on the page can list what has changed
        since the season began, however often you close the editor or download the ROM in between, because the
        starting point is kept with your work in this browser and in a project file. It is not in the ROM. Your
        league rules carry over. Starting another season replaces the starting point.
      </p>
      <p>
        A player released shows as "now a free agent", and one signed as "signed from the free agents", so the
        list reads as a record of the off-season.
      </p>

      <h3 id="help-compare">Comparing two ROMs</h3>
      <p>
        <b>Compare ROMs</b> describes how what is in the editor differs from another ROM you choose, such as last
        season's. The other ROM is only read. Teams are matched by their place in the list, and players by name, so
        it reports players added, removed and renamed, changed numbers and attributes, line changes, and changes to
        colours, logos and banners, player photos (by player, so a photo that followed its player is not counted),
        the featured players, score logos and game settings.
      </p>
      <p>
        Above that detail is a summary <b>for the league</b>, which matches players by name across all teams
        instead of team by team. It lists who changed teams, who is new, who is no longer in the ROM, and every
        player whose overall rating changed, biggest change first. <b>Download report</b> saves the summary and the
        detail as a plain text file, and <b>Copy report</b> puts the same text on the clipboard to paste into a
        message or a post. The report is titled with the other ROM's file name and the Name box at the top.
      </p>
      <p>
        Because players are matched by name, a renamed player reads as one leaving and another arriving in the
        summary. Each team's logos and banners are compared too, a line for each one that differs (its pixels, and
        a menu logo's or an SNES team logo's own colours); colours a picture shares with the team are among the
        team's colours. The Changes page lists a logo or banner you have drawn or imported the same way.
      </p>

      <h3 id="help-download">Downloading your work</h3>
      <ul>
        <li>
          <b>Download ROM</b> saves the complete edited ROM as a .bin file, ready for an emulator or flash cartridge.
        </li>
        <li>
          <b>Download patch</b> saves an IPS file holding only your changes. Someone with the same ROM you opened can
          apply it with any IPS patching tool to get your version, which lets you share your work without sharing the
          ROM. The patch only fits that exact starting ROM.
        </li>
      </ul>
      <p>Both use the Name box for the file name.</p>

      <h3 id="help-roms">Supported ROMs and limits</h3>
      <p>
        The editor opens: {SUPPORTED_GAMES.join('; ')}. Genesis files can be .bin or .smd, and are downloaded as
        .bin; SNES files can be .smc or .sfc, and are downloaded as .smc. A ROM edited here, or with the original
        NOSE, can be opened again.
      </p>
      <p>
        League and season ROMs built on the 30-team hack open as that, whatever their size of roster, and so do
        hacks that put fewer skaters on the ice. The editor changes only the data it understands and leaves a
        hack's altered game code exactly as it is, so what a hack does differently keeps working.
      </p>
      <p>
        ROMs set up with the hack program smozROM open too, in any of its combinations. The editor can tell how
        such a ROM was set up, as NOSE does, and the top bar says so:
      </p>
      <ul>
        <li>
          <b>A base weight for another era.</b> Weights are shown from the base the ROM uses, so a ROM set up for
          the 2000s shows 144 pounds where the original game shows 140.
        </li>
        <li>
          <b>Ratings from 0 to 15.</b> They are shown and edited as the numbers stored, and every value from 0 to 15
          is on offer. That set-up brings its own way of working out overall ratings, so Ovr and everything built
          on it use a plain average instead: useful for comparing players, but not the number the game shows.
        </li>
      </ul>
      <p>
        Those programs put their own additions in the unused room at the end of a ROM. When the editor needs room
        there, for longer rosters or for pictures, it uses only the room after them and moves nothing, so such hacks
        keep working.
      </p>
      <p>
        Hacked ROMs have been tested less widely here than the original game: the editor can see what a hack
        changed but cannot know everything it relies on. Keep a copy of the file you opened, and try a download in
        the game before you hand it to anyone.
      </p>
      <p>
        Hacks that put fewer skaters on the ice are played with line changes off, and are known to crash with them
        on. That is how those hacks behave, not something the editor causes or can fix. Only the first line, NLC,
        is used in them. Their penalties do not work properly: in a 3 on 3 ROM a first penalty gives no one a power
        play, and a second leaves the team with two skaters (found by the NHL94 Match Viewer project). The Genesis
        option <b>3 on 3 overtime</b> works differently, and its penalties work as the NHL's. Roster edits to these
        ROMs have been checked in the game. A team's page has a notice at the top when the ROM is one of these.
      </p>
      <p>
        Where a ROM is someone's own release, the notice names it and its maker, with a link to its official post on
        the NHL94 forum: NHL 94 EVO by AdamCatalyst, and McMarkis's SNES NHL 94: 32 Team + 60 FPS + Fighting and SNES NHL 94: Fighting + 60 FPS.
        That is where to find the latest version and its notes.
      </p>
      <ul>
        <li>
          <b>NHL 94: EVO</b> rebuilds much of the game, and the editor supports part of it: rosters, lines, team
          names, team and rink colours, and the centre-ice and menu logos, along with the spreadsheet and picture
          files for those. Its 64 teams are listed under its three leagues. What differs:
          <ul>
            <li>
              Game settings, playoff draws and banners are kept in ways the editor cannot follow. They are not shown
              and are never changed.
            </li>
            <li>
              Attributes are edited as the values stored, 0 to 15, because that hack gives them meanings and
              display numbers of its own. Three goalie values the original game leaves at zero are in use there;
              the editor shows them as G7, G9 and G10 without knowing what they stand for.
            </li>
            <li>
              The game works out overall ratings its own way. The editor's Ovr, and everything built on it such as
              the League page, uses a plain average of a player's values instead: useful for comparing, but not the
              number the game shows.
            </li>
            <li>
              Each team has a fixed amount of room of its own. The figure at the top of the page shows the room left on the fullest
              team, and a team that outgrows its room has to be trimmed before the ROM can be downloaded.
            </li>
            <li>
              The colour previews are drawn with the original game's player artwork, which that hack has redrawn, so
              they show roughly where each colour goes, not exactly.
            </li>
            <li>
              Check ROM does not look for strips that are hard to tell apart in this ROM, since its players are
              painted with the colours in ways of its own.
            </li>
            <li>
              Bringing a team in from the original game or a 30-team ROM carries its attributes across as stored,
              on the other scale, so they need adjusting afterwards.
            </li>
          </ul>
        </li>
        <li>Other games in the series, and hacks that rearrange the game's data in other ways, are not supported yet.</li>
        <li>
          Some hacks store a count of defencemen that does not match the roster, or fill a roster with copies of
          one player. Check ROM mentions these as notes; they are how the hack was made, not mistakes. Adding or
          removing a player, or changing the number of forwards, sets the defence count to fit the roster.
        </li>
        <li>
          Team logos and banners can be replaced, and player photos. Other graphics, such as player sprites and
          the title screens, cannot.
        </li>
        <li>
          So that the game will run a changed ROM, the editor turns off the game's own check that the ROM is
          unchanged, as NOSE does.
        </li>
      </ul>

      <h3 id="help-snes">The SNES game</h3>
      <p>
        NOSE4Web also opens NHL '94 for the SNES, the original game and league ROMs built on it. The SNES game keeps
        its players, lines and team ratings just as the Genesis game does, so most of the editor works the same:
        rosters, lines, team names, the six team ratings, team colours, spreadsheet files, project files, the league
        page, trades, bulk changes, importing a team, checking the ROM, changes and comparing.
      </p>
      <ul>
        <li>
          <b>Overall shown:</b> the team overall on the matchup screen and the player cards is a stored number, so it
          does not change when the players do. It is on the team page and in the Teams spreadsheet; see below for
          setting it to the roster's average.
        </li>
        <li>
          <b>Ovr</b> for players is worked out as the SNES game does it on its roster screens. For skaters that is
          the same as on the Genesis; a goalie can come out one higher, as the SNES rounds differently.
        </li>
        <li>
          <b>Team colours:</b> each team has a white home strip and a dark away strip of 16 colours, shown on the
          game's own players, drawn from the ROM. The SNES has 32 levels of each of red, green and blue where the
          Genesis has 8. The first colour is never used on the players. The Teams spreadsheet has them too. Colours
          do not come across from a Genesis ROM, as the two games use their colours differently.
        </li>
        <li>
          <b>Hacks:</b> the SNES Hacks page works like the Genesis one, each hack explained beside its setting. A hack
          is only changed if that part of the ROM is as the original game or the hack has it. It has:
          <ul>
            <li>
              From NHL94SNESVault, by McMarkis and its contributors: the <b>hot and cold bug fix</b> (in the original
              game a bug puts about half of every player's ratings at the maximum each game, whatever they are in
              the ROM; the fix makes the ratings you set the ones that play), defence control on from the start (among
              the recommended hacks, as leagues play with it),
              one-minute penalties, 30-second periods, no interference penalties, no penalty shots, no goal posts,
              skipping the intros, the extra attacker fix, any skater at any position in Edit Lines, showing the
              maximum boost in Edit Lines, and pulling the goalie with L+R (the last two in NOSE4Web's versions,
              which fix gaps in the Vault's), and the bodycheck counts for each player, shown in Player Stats (sorted by
              them too, where the Vault's sorts by penalty minutes; the counts stay where nhl94online.com reads them).
            </li>
            <li>
              On McMarkis's SA-1 and 32-team builds, which are laid out differently, the editor still finds the
              hacks, including those first made for the original game (the extra attacker fix, any skater at any
              position, the maximum boost, the L+R goalie pull and the injury risk, each tested in the game on those
              builds by the NHL94 Match Viewer project). NOSE4Web's fighting and bodycheck counts are not offered
              there, as those builds have their own.
            </li>
            <li>
              As on the Genesis: the power play and penalty kill, comeback bonus, faceoff spot, second-assist and
              regained-puck assist fixes, the computer forwards' awareness option, counting stick deflections as
              shots, the extra period length with its own 99-minute overtime, and Ron Barr's pick, every game or by a coin flip.
            </li>
            <li>
              The SNES's own: penalty shot fixes (a penalty shot whistled dead because the net was knocked off, or
              because the loose puck stood still for two seconds, is no longer taken again), and a Y button fix (a
              skater in a move that locks him, such as being knocked down, can no longer hook or hold with Y).
            </li>
            <li>
              More SNES fixes, each found by a league member or the NHL94 Match Viewer project:{' '}
              <b>B while checking or bursting</b> (B could pick your own skater mid-check or mid-burst, who can then
              neither poke nor hand over, so nothing happened; now it switches to the next best skater) and{' '}
              <b>L and R while busy</b> (L and R were ignored while your skater was checking, bursting, down, hooking
              or holding; now they take the defenceman),{' '}
              <b>one-timer that never fires</b> (a one-timer whose pass came too late left the player swinging with the
              puck and never shooting) and <b>shot that never fires</b> (a shooter who gathered the puck again during
              his wind-up after it was knocked loose never shot), all recommended. <b>No icing within the crease</b>
              (recommended): a puck crossing the goal line within the crease's width is not icing, as on the Genesis.
            </li>
            <li>
              Hits and energy, as on the Genesis, with an <b>Energy from hits only</b> button, and{' '}
              <b>energy takes all of a skater's speed</b>, which the SNES needs for that: in the original game an
              empty skater keeps half his speed.
            </li>
            <li>
              <b>Goalie poke check reaches the ice</b>: in the original game a goalie's poke (X) straight up or down
              the ice never reaches the puck; with this on it knocks it loose, as a sideways poke can. Recommended.
            </li>
            <li>
              <b>Fighting</b>: McMarkis's port of the NHLPA 93 SNES fights, built in with his permission, with a
              bonus to every player's fighting rating (2 by default, as in his patch; higher makes fights more common).
              It makes a 1 MB ROM 2 MB, and comes out cleanly. It works alongside the injury risk option (tested in the
              game by the NHL94 Match Viewer project). It is for ROMs built on the original game, not McMarkis's SA-1
              and 32-team builds, which have fights of their own. It includes his later fixes, as in those builds: a
              player hurt in a fight is out for the rest of the game, and the two fighters' majors offset, so the teams
              stay at full strength while they sit (since 13 November 2026; apply the hacks again to update an earlier
              fighting ROM).
            </li>
            <li>
              <b>Overtime until a goal in the regular season</b>: a regular-season game still tied after its 5:00
              overtime plays more overtime until someone scores, as a playoff game does, instead of ending in a tie.
              As on the Genesis; tested in the game by the NHL94 Match Viewer project.
            </li>
            <li>
              <b>A shootout for tied regular-season games</b>: the game's own shootout, after one overtime or straight
              after period 3, as on the Genesis. The winners get one goal more on the scoreboard, the stats and scoring
              summary are the game's, and Exit Shootout is locked while it plays, as leaving would throw away the whole
              game. Tested in the game by the NHL94 Match Viewer project on the original game, Classic, and the 32-team
              and SA-1 builds. On McMarkis's 2 MB builds the shootout freezes in its first round when the computer
              plays both sides (their own Shootout mode does too, with or without NOSE4Web); with a person on a team
              it plays normally, as in every league game.
            </li>
            <li>
              <b>Injuries</b>: the Genesis choices, from never to a long fall instead. Tested in the game by the NHL94
              Match Viewer project on the original game and the SA-1 build.
            </li>
            <li>
              <b>3 on 3 overtime</b>: as on the Genesis, each team's goalie and its line's LW, C and RD play overtime,
              in the regular season or every overtime; a penalty gives the other team an extra skater, and a team with
              three in the box plays two skaters. For the original game, league ROMs built on it, and McMarkis's
              32-team and SA-1 builds; tested in the game on the original game and the SA-1 build.
            </li>
          </ul>
        </li>
        <li>
          <b>Logos</b>, on the team page, to export as PNG images and import again, to draw in the editor (see Logos
          and banners), or to copy to another team:
          <ul>
            <li>
              The <b>team logo</b>, on the matchup, setup and player card screens, has 15 colours of its own, taken
              from the image you import, and can use at most 36 different squares of 8 by 8 pixels (empty squares and
              repeats, even flipped ones, are free). In the original game all the logos share one space, so a logo
              more detailed than the one it replaces fits only if others take less; the editor packs the other logos
              more tightly, without changing how they look, when that helps. ROMs rebuilt with more teams keep each
              logo apart, so a bigger one simply goes into free space.
            </li>
            <li>
              The <b>centre ice logo</b> is drawn in the rink's colours, two rows of 15 that every team shares, faded
              as if seen through the ice; each 8 by 8 square of it uses whichever row suits it best. It can use as
              many different squares as the largest original centre ice logo (exact repeats are free, flipped ones are
              not). It may also be another size, in whole squares, if it has no more of them than the one it replaces
              (64 by 32 for 48 by 48, say); the game centres it. In McMarkis's SA-1 builds each team's centre ice logo
              has 15 colours of its own instead, and an imported one is matched to them.
            </li>
            <li>
              While you draw, each logo shows how many different squares it uses against the most it may have, and
              says plainly when a stroke would take it over. The centre ice logo is shown on the rink as you draw,
              with its colours listed by row and the rows it uses marked.
            </li>
          </ul>
        </li>
        <li>
          <b>Banners:</b> the SNES game has no picture banners. A team's banner is a block of colour with its name
          lettered on it, its <b>Banner name</b>, which is separate from the team's other names and also shows in the
          playoff bracket. It follows the place name while the two are the same, and can be shortened on the team
          page. All the banner names share a little room; in the original game they share it with the rosters, so
          there Check ROM says if they need more, and a 32-team ROM has plenty. The banner's 16 colours, its{' '}
          <b>Name banner colours</b>, are below the logos, with the banner shown as the menus draw it: 2 to 14 fill
          the block in two runs of shades (2 to 7 and 8 to 14), 15 is its frame, and 7 and 8 also colour the stripes
          on the player card's team page. <b>Use the banner of</b> gives a team another team's banner colours, and
          its banner name unless you untick it.
        </li>
        <li>
          <b>Import a team</b> brings a team's banner name and colours, and its logos: the team logo, the centre ice
          logo (matched to the colours this ROM draws it in) and the score logo.
        </li>
        <li>
          <b>Score logos:</b> McMarkis's 32-team builds show a small logo for each team in the score box during
          play, where the original game prints the team's three letters. Where a ROM has them, the team page has a{' '}
          <b>Score logo</b> section: export it, import one (24 pixels wide and 16 high, or 13, the logo without the
          gap under it), or draw it, in the box's black, its white ring and 10 colours of its own taken from the
          image. Each team's buttons act on that team only: <b>Show Boston's letters instead</b> (with the team's own
          name) has it show its letters, as the original game does, while every other team keeps its logo; then{' '}
          <b>Give Boston a score logo</b> makes it one again from its team logo. The original game has no score
          logos, but the editor can add them to it and to ROMs built on it: <b>Add score logos for every team</b>, on
          any team's page, adds McMarkis's score logos (adapted with his permission) and gives every team one made
          from its team logo, to touch up or replace. The power play box by the clock shows the logo too.{' '}
          <b>Take score logos out of this ROM</b> puts the ROM back as it was. The horizontal scoreboard keeps its
          name banners.
        </li>
        <li>
          <b>Game settings:</b> as for the Genesis: the clock, the main menu's starting choices, how many teams the
          menu offers, the penalty and stoppage messages, and the 32 playoff draws. The clock's fourth period length,
          30 seconds, is offered on the menu by the 30-second periods hack. Overtime in the regular season is 5
          minutes; in the playoffs an overtime period is as long as the others. In the playoff modes the menu shows
          the Home line as Team and hides the Visitor line. Under the clock, <b>Computer pulls its goalie</b> sets
          when a team the computer controls pulls its goalie in the third period: when behind by 1 up to how many
          goals, with how many seconds or less left (1 to 2 goals and 60 seconds in the original game; 0 goals for
          never), the same two numbers as NHL94SNESVault's setting. The penalty minutes are the length of each
          penalty, which the one-minute penalties hack changes. A message cannot be longer than the room the game
          gives it. In a draw the 16 teams are in the order of the playoff tree.
        </li>
        <li>
          <b>Rink colours:</b> the SNES rink has 128 colours in eight rows of 16, and the page draws the whole rink
          from the ROM in them, with the home team's centre ice logo in its middle and the players on the benches in
          the two teams' uniform colours (pick the teams above it). Rows 0 and 1 colour the ice, its lines, the
          boards and the crowd; rows 5 and 6 are the centre ice colours every team's logo is drawn in, unless it has
          its own; rows 4 and 7 are not drawn on the rink. Rows 2 and 3 are not offered, as the game puts the teams'
          uniform colours there for every game. The game also uses some of these colours for other graphics, so a
          change can show there too.
        </li>
        <li>
          <b>Space:</b> in the original game the teams fill the room the game gives them, but the editor can also use
          some spare room next to it: enough for about 70 more players in the original game, and much more in the
          32-team ROM. Teams that no longer fit in the usual place move into that room, and back again if they fit
          once more. The top bar shows how much room there is in all.
        </li>
        <li>
          <b>Rebuilt ROMs:</b> some SNES ROMs are rebuilt with another number of teams, such as one with all 32 of
          today's NHL teams, and are laid out differently; its later builds are for the SA-1 chip, which emulators
          and flash carts run. The editor finds the teams, colours and hacks in them anyway. If a ROM was opened
          with an intro already skipped, the skip cannot be taken out.
        </li>
        <li>
          <b>Importing</b> a team from a Genesis ROM brings its names, roster and lines, but not its colours.{' '}
          <b>Comparing</b> a Genesis ROM with an SNES one matches the teams by name, since the two games keep them in
          different orders, as does comparing two SNES ROMs with different sets of teams.
        </li>
        <li>
          Some copies of the ROM have an extra header from old copier devices. It is kept, so the file you download
          is the same kind as the one you opened. The ROM's checksum, which emulators report on (the game itself
          does not check it), is corrected when you download, if the ROM is a standard size.
        </li>
      </ul>
      <p>
        SNES editing is new and has been checked against fewer ROMs than Genesis editing, so keep a copy of the file
        you opened, and try the ROM in an emulator before your league plays it.
      </p>

      <h3 id="help-nhl95">NHL '95</h3>
      <p>
        NOSE4Web also opens NHL '95 for the Genesis: the original game and league ROMs built on it, such as the
        WN95HL's 34-team ROMs. NHL '95 keeps its teams, players and lines as NHL 94 does, so the editor works the same
        for rosters, names, jersey numbers, ratings, lines, team names and arenas, team and rink colours, playoff draws,
        period lengths, rules, the main menu's starting choices, spreadsheet files, project files, the league page,
        trades, bulk changes, importing a team, checking the ROM, changes and comparing. It reads NHL '95 as NOSE did,
        and the NHL94 Match Viewer project has checked it against the game.
      </p>
      <ul>
        <li>
          <b>H/F</b>: the shooting hand and fighting share one value, as in NHL 94, but the other way round: an odd
          value is a left-handed shot.
        </li>
        <li>
          <b>StH</b>: stick handling has sixteen steps, 0 to 15, where the other ratings have seven. Each is shown as
          the range the game displays, with its number in brackets; in play the game groups them into seven (0, 1-2,
          3-5, 6-8, 9-11, 12-14, 15), and Ovr counts it that way.
        </li>
        <li>
          <b>Ovr</b> is worked out as the game does on its roster screen, and matches every overall in the original
          game. The league value and the notes on what each rating does in play are NHL 94's, so they are not shown.
        </li>
        <li>
          <b>Team colours</b>: NHL '95 uses a strip's 16 colours differently from NHL 94 (the jersey's main colour,
          the goalie's pads and mask, a stripe at the shoulders and waist...). Each is labelled with what it colours,
          as Match Viewer found in the game, and the previews are NHL '95's own players and rink.
        </li>
        <li>
          <b>Between NHL 94 and NHL '95</b>: players copied from one and pasted into the other, or a team brought in from
          the other, keep their shooting hand and their stick handling as they played; a team's colours are moved to
          the part of the player they colour in the other game.
        </li>
        <li>
          <b>The main menu</b>: Team 1 and Team 2 (or Home Team and Away Team), period length, goalies, user records,
          penalties and line changes, and the play modes the game can start in.
        </li>
        <li>
          <b>As in NHL 94</b> (checked by Match Viewer): the goalie bytes and forward count split the roster the same
          way, and only whether a goalie box is 0 matters; the six team ratings do the same jobs; and new playoffs
          freeze with a Team 1 that is in none of the playoff draws, which Check ROM looks for. One difference: a
          season remembers each team's forward and defence counts from when it started, so a change to them only
          affects seasons started afterwards.
        </li>
        <li>
          <b>Room</b>: the original game's teams have no spare room. <b>Add roster space</b> moves them to unused
          space in the ROM with 16,384 bytes to spare, as the WN95HL's ROMs have; the ROM stays 2 MB. League ROMs
          that have moved their teams already have room of their own.
        </li>
        <li>
          <b>Logos</b>: each team's menu logo (48 by 48 pixels) and centre-ice logo (48 by 32, in the home team's
          strip colours) can be exported, drawn and imported, as in NHL 94, on the team page and in Picture files. A menu logo
          has white, black and 9 colours of its own; its other colours are the team's stripe colours and colours every
          team shares. In the original game the menu logos are packed tight, so a detailed one needs{' '}
          <b>Give the logos more room</b> first; the WN95HL's ROMs have the room already. Logos can come from an NHL 94
          ROM with <b>Import a team</b>. Both tested in the game by the NHL94 Match Viewer project.
        </li>
        <li>
          <b>Banners</b>: each team's name banners, 88 by 16 pixels, replaced as in NHL 94. The <b>menu banner</b> is
          the location on Game Setup, in white, black and the team's two banner colours, which can be changed as in
          NHL 94. The <b>in-game banner</b> is the location with the stripes drawn in, on the line change, stats,
          standings and other screens, in colours every team shares. The <b>pause screen banner</b> is the team's
          nickname on the pause screen, 96 by 16 pixels, in the pause screen's colours. The WN95HL's ROMs have no menu
          banners of their own, so only the other two are offered there. In the original game the banners are packed
          tight, so a detailed one needs <b>Give logos and banners more room</b> first; the in-game banners are also
          limited by how much detail the playoff tree screen can hold. NHL
          94's banner lettering is not offered for NHL '95. Tested in the game by the NHL94 Match Viewer project.
        </li>
        <li>
          <b>Hacks</b>: NHL '95 has a Hacks page of its own, every option on it tested in the game by the NHL94 Match
          Viewer project.
          NHL 94's fixes where NHL '95 has the same code: the three
          assist fixes, the Aggression, power play and penalty kill, comeback bonus and computer forwards' awareness
          fixes, the faceoff spot fix, counting stick deflections as shots, the one-timer open net fix, the five-hole blind ring fix,
          the <b>rocket pass fix</b>, the runaway speed fix, the computer goalie pull fix, the pulled-goalie sniping fix
          (an option) and the two penalty shot fixes.
          The <b>pass direction fix</b>, an option: in NHL '95 a pass now and then goes straight across, or back behind
          the passer, instead of to the teammate he's pointing at. NHL 94's overtime and shootout options:{' '}
          <b>overtime until a goal</b>, a <b>shootout</b> for tied regular-season games (after overtime or after period
          3), the <b>NHL shootout</b> (three rounds, then sudden death) and <b>3 on 3 overtime</b>. And{' '}
          <b>Fighting</b>, Vancecookcobxin's fighting patch with a fix by Match Viewer: it adds a Fighting setting to Game
          Setup (Off, On, or On - Arcade Mode), and a league chooses which it starts at. Players fight by their Fighting
          rating (in Handed/Fighting): 71 or more to start a fight, 14 or more to fight back. The WN95HL's Season 18 ROM
          rates no one, so a league there raises some.
        </li>
        <li>
          <b>Organ songs</b>: as in NHL 94, on the Game settings page: each of NHL '95's 36 songs can be played, saved
          as a MIDI file, replaced with a MIDI file of your own (at most seven notes at once, as NHL '95's own songs have, on the organ) and put back;{' '}
          <b>Used by</b> shows the teams that have it. Any of the songs can be replaced. Each team page chooses its six
          songs, and the songs file in Files numbers them 1 to 36. NHL '95's songs are NHL 94's tunes, and are named as
          NHL 94's are. Tested in the game by the NHL94 Match Viewer project.
        </li>
        <li>
          <b>Not offered for NHL '95</b>: NHL 94's hacks, player photos, score logos,
          the splash screen and menu picture, moving teams, and the opening text, which were all made for NHL 94's code.
        </li>
      </ul>

      <h3 id="help-trouble">If something goes wrong</h3>
      <ul>
        <li>
          <b>"This game is not supported yet"</b>: the editor does not recognise the ROM (the message shows the
          code it found).
        </li>
        <li>
          <b>"The team data is not stored as one continuous run"</b> or <b>"does not have the expected layout"</b>:
          the ROM has been rearranged in a way the editor cannot safely write back.
        </li>
        <li>
          <b>The download buttons are greyed out</b>: the team data is over the limit. Shorten some names, remove a
          player, or add roster space.
        </li>
        <li>
          <b>The edited ROM misbehaves in the game</b>: look at <b>Check ROM</b> first, then the lines of any team
          whose roster you changed. If it still fails, open your original ROM again and repeat the changes
          a few at a time to find the one responsible.
        </li>
        <li>
          <b>A paste does nothing or reports the wrong contents</b>: copy again, and allow clipboard access if the
          browser asks.
        </li>
      </ul>

      <h3 id="help-credit">Credit</h3>
      <p>
        NOSE4Web is based on NOSE, the NHL Old Skool Editor for Windows, written by wboy. Its understanding of how
        these games store their data comes from NOSE.
      </p>
      <p>
        Many of the Genesis hacks are the work of smozoma (Michael Capewell), ported from his program smozROM with
        his permission, as is the table of weights by season. Others come from guides on the NHL94 forums, each
        credited beside it on the Hacks page (among them chaos, TheTome, CoachMac, clockwise, kingraph, Drezz,
        AdamCatalyst, Sean and McMarkis, whose Genesis patches gave the fourth period's overtime). Most of the fixes,
        and every hack's test in the game, are the NHL94 Match Viewer project's.
      </p>
      <p>
        Fighting on the Genesis is chaos's fighting patch, made by chaos with McMarkis and AbdulBCRT
        (github.com/Chaos81/nhl94-patches), under the MIT licence: Copyright (c) 2025 Chaos81. Head bleeding follows
        NHLPA '93's. Fighting on the SNES is McMarkis's port of the NHLPA 93 SNES fights, built in with his
        permission, with his fix keeping a player hurt in a fight out for the game; the SNES time on ice count and
        Player Stats page are his too, adapted with his permission. McMarkis's own SNES builds (32 teams, 60 FPS, fighting, the SA-1 chip) are his releases; NOSE4Web
        edits them and puts its hacks into them, and their score box logos, with his permission, gave the original
        game's.
      </p>
      <p>
        The Play hacks on that page come from findings posted on the NHL94 forums: the C-then-B check finding and
        the goalie's range by smozoma; the goalie's hold time by clockwise and smozoma; energy, the speed burst and
        stopping and turning by wboy, with Tony H; and the real-time clock by Brodeur30, smozoma, kingraph and
        AverageRangersFan.
      </p>
      <p>
        What the ratings do in play, what the team ratings do, the weight bug and C-then-B fix, the rocket pass, and the Aggression and comeback bonus bugs come from
        the{' '}
        <a href="https://github.com/nhl94dotcom/NHL94MatchViewer" target="_blank" rel="noreferrer">
          NHL94 Match Viewer
        </a>{' '}
        project, which read them in the community's disassembly of the game by abdulahmad and checked them against
        recorded games.
      </p>
      <p>
        What the editor knows of the SNES game comes from the community's disassemblies of NHL '94 for the SNES:{' '}
        <a href="https://github.com/abdulahmad/NHL94SNES" target="_blank" rel="noreferrer">
          NHL94SNES
        </a>{' '}
        by abdulahmad, with chaos, StaticEck, McMarkis (Mhopkinsinc) and Drezz, and special thanks to smozoma and
        kingraph; and{' '}
        <a href="https://github.com/Mhopkinsinc/NHL94SNESVault" target="_blank" rel="noreferrer">
          NHL94SNESVault
        </a>{' '}
        by McMarkis (Mhopkinsinc) and its contributors, whose patches are the SNES hacks; and from the SNES findings
        of the NHL94 Match Viewer project.
      </p>
      <p>
        NOSE4Web is free software, released under the GNU General Public License, version 3 or later. It comes
        with no warranty. Its source code is at{' '}
        <a href="https://github.com/nhl94dotcom/NOSE4Web" target="_blank" rel="noreferrer">
          github.com/nhl94dotcom/NOSE4Web
        </a>
        .
      </p>
    </main>
  )
}
