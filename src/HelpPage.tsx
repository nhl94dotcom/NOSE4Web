import { SUPPORTED_GAMES } from './core/games'
import { MAX_ROSTER, MIN_ROSTER } from './core/roster'
import { MAX_SECONDS } from './core/settings'
import { CSV_TABLES } from './core/tables'

const SECTIONS = [
  ['start', 'Getting started'],
  ['space', 'Space in the ROM'],
  ['teams', 'Teams'],
  ['players', 'Players and goalies'],
  ['copy', 'Copy and paste'],
  ['keys', 'Quick edit keys'],
  ['lines', 'Lines'],
  ['colours', 'Team colours'],
  ['rink', 'Rink colours'],
  ['settings', 'Game settings'],
  ['csv', 'Spreadsheet files'],
  ['download', 'Downloading your work'],
  ['roms', 'Supported ROMs and limits'],
  ['trouble', 'If something goes wrong'],
  ['credit', 'Credit'],
]

export function HelpPage() {
  return (
    <main className="team help">
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
          Pick a team from the list on the left, or one of the entries below the teams: <b>Rink colours</b>,{' '}
          <b>Game settings</b> or <b>Spreadsheet files</b>.
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
        Your work lives in this tab until you download it. A note at the top reads <i>Not downloaded yet</i> while
        there are changes you have not saved, and the browser will warn you before closing or refreshing the tab.
      </p>

      <h3 id="help-space">Space in the ROM</h3>
      <p>
        All the teams share one fixed block of the ROM. The figure at the top of the page, such as{' '}
        <i>120 bytes free</i>, is how much of that block is unused. If it reads <i>bytes over the limit</i>, the
        download buttons are switched off until you free some room.
      </p>
      <ul>
        <li>Each character in a player or team name uses one byte, rounded up to an even number per name.</li>
        <li>Each player uses 10 bytes plus their name. A newly added player uses 14.</li>
        <li>Attributes, jersey numbers, lines and colours use no extra space, however you change them.</li>
        <li>Free space is shared: shortening a name on one team makes room on any other.</li>
      </ul>
      <p>
        The original NHL 94 ROM has no free space at all, so a name can only grow if another shrinks. For that ROM a
        button appears at the top:
      </p>
      <ul>
        <li>
          <b>Add 934 bytes of roster space</b> moves the opening screen text to an unused part of the ROM. The ROM
          stays the same size.
        </li>
        <li>
          After that, <b>Add 512 bytes of roster space</b> moves the playoff draw tables too. This doubles the ROM
          file to 2 MB, which emulators and flash cartridges handle normally.
        </li>
      </ul>
      <p>
        Neither can be undone except by opening the ROM again. ROMs that already keep their teams elsewhere, such as
        the 30-team hack, do not offer the button and usually have plenty of room already.
      </p>

      <h3 id="help-teams">Teams</h3>
      <p>The top of a team's page has:</p>
      <ul>
        <li>
          <b>Location, Initials, Name, Stadium</b>: the four pieces of text the game shows for a team. Only letters,
          digits and common punctuation can be used, since that is all the game's font contains.
        </li>
        <li>
          <b>Forwards</b>: how many skaters, counted from the top of the Skaters table, the game treats as forwards.
          The rest are defencemen. Each row's <b>Pos</b> column shows the result.
        </li>
        <li>
          <b>Goalie bytes</b>: four values. The first players on the roster are goalies, one for each value up to
          the last that is not zero. What the values mean beyond that is not known, so it is safest to leave existing
          ones alone and use 1 for a goalie you add.
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
          <b>No.</b>: the jersey number, 00 to 99.
        </li>
        <li>
          <b>Ovr</b>: the overall rating the game will show. It is worked out from the attributes as you edit and
          cannot be typed in.
        </li>
        <li>
          <b>Wgt</b>: weight in pounds, in steps of 8 from 140 to 260.
        </li>
        <li>
          <b>Ratings</b> such as Agl and Spd: seven levels, shown as the range the game displays for each, from 25-29
          up to 99.
        </li>
        <li>
          <b>H/F</b> (skaters): shooting hand and fighting ability together, such as R/57.
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
          <b>Paste attributes only</b> keeps each row's name and jersey number.
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
        every position. The first line on the list, NLC, is the one used when line changes are off.
      </p>
      <p>
        The game expects the first goalie on the roster in the G column, no goalie in a skater's position, and no
        player twice on one line. The editor does not stop you breaking these, so check them in the game if you do.
      </p>

      <h3 id="help-colours">Team colours</h3>
      <p>
        Each team has 16 home and 16 away colours. Click a swatch to select it; its purpose, such as{' '}
        <i>Pants (dark)</i>, is shown beside the controls. Change it with:
      </p>
      <ul>
        <li>the <b>Red, Green, Blue</b> sliders, each with the eight levels the console can show;</li>
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
        Every colour is matched to the nearest of the 512 the console can display, so a picked colour may shift
        slightly. The pictures beside the swatches redraw as you work. <b>Copy from away</b> and{' '}
        <b>Copy from home</b> copy one set over the other.
      </p>

      <h3 id="help-rink">Rink colours</h3>
      <p>
        <b>Rink colours</b>, below the teams, has 16 colours for the ice and 16 for the arena around it. They are
        shared by every rink in the game. Use the list above the picture to preview different parts of the rink and
        the pause menu.
      </p>

      <h3 id="help-settings">Game settings</h3>
      <ul>
        <li>
          <b>Clock</b>: the period lengths in seconds, with the text the menu shows for each, and the overtime and
          shootout lengths. The most a clock can hold is {MAX_SECONDS} seconds. Changing the seconds does not rewrite
          the menu text, so change both.
        </li>
        <li>
          <b>Main menu starting choices</b>: what each item on the game's main menu is set to when the game starts.
        </li>
        <li>
          <b>Rule messages</b>: the text shown for icing, penalties and so on, how long each stays on screen, and
          the penalty minutes. A message cannot be longer than the space the game gives it. Several appear more than
          once because the game keeps separate copies for different situations.
        </li>
        <li>
          <b>Playoff draws</b>: the game picks one of these at random when a new playoff starts. Each lists 16 teams
          in seeding order. A warning appears if a team is in one draw twice.
        </li>
      </ul>

      <h3 id="help-csv">Spreadsheet files</h3>
      <p>
        <b>Spreadsheet files</b> exports everything in the editor as {CSV_TABLES.length} CSV files that Excel and
        similar programs can open, and imports them again. Each file covers every team and starts with the{' '}
        <b>Name</b> at the top of the page, for example <i>My_League_Season_10_players.csv</i>.
      </p>
      <table className="left">
        <tbody>
          {CSV_TABLES.map((table) => (
            <tr key={table.id}>
              <td>_{table.id}.csv</td>
              <td className="wrap">{table.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>To use them:</p>
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
          Colours are written like <i>#24ffff</i> and are matched to the nearest colour the console can show.
        </li>
        <li>
          Lines, playoff draws and menu choices are written by name. Where two share a name, a number is used
          instead, written like <i>#12</i> for a roster position.
        </li>
        <li>Columns the editor does not know, such as your own notes, are ignored. So are Team name and Overall.</li>
        <li>Importing a set changes the Name box to that set's name.</li>
      </ul>
      <p>
        To build a ROM for a new season: open the base ROM, add roster space if the button is offered, import that
        season's files in one go, check the free space, and download.
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
        The editor opens: {SUPPORTED_GAMES.join('; ')}. Files can be .bin or .smd, and downloads are always .bin. A
        ROM edited here, or with the original NOSE, can be opened again.
      </p>
      <ul>
        <li>Other games in the series, and hacks that rearrange the game's data in other ways, are not supported yet.</li>
        <li>Graphics such as logos, banners and player sprites cannot be edited, only colours.</li>
        <li>
          To let the game run a changed ROM, the editor switches off the game's check of its own contents, as NOSE
          does.
        </li>
      </ul>

      <h3 id="help-trouble">If something goes wrong</h3>
      <ul>
        <li>
          <b>"This game is not supported yet"</b>: the ROM's product code, shown in the message, is not one the
          editor knows.
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
          <b>The edited ROM misbehaves in the game</b>: check the lines of any team whose roster you changed, and
          that no attribute is showing in red. If it still fails, open your original ROM again and repeat the changes
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
    </main>
  )
}
