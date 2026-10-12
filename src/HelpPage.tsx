import { SUPPORTED_GAMES } from './core/games'
import { LOGO_COLORS } from './core/graphics'
import { MAX_ROSTER, MIN_ROSTER } from './core/roster'
import { MAX_SECONDS } from './core/settings'
import { CSV_TABLES } from './core/tables'

const SECTIONS = [
  ['start', 'Getting started'],
  ['space', 'Space in the ROM'],
  ['teams', 'Teams'],
  ['players', 'Players and goalies'],
  ['arrows', 'Moving with the keyboard'],
  ['copy', 'Copy and paste'],
  ['keys', 'Quick edit keys'],
  ['lines', 'Lines'],
  ['colours', 'Team colours'],
  ['pictures', 'Logos and banners'],
  ['picturefiles', 'Picture files'],
  ['rink', 'Rink colours'],
  ['settings', 'Game settings'],
  ['reset', 'Resetting changes'],
  ['csv', 'Spreadsheet files'],
  ['project', 'Project files'],
  ['league', 'The league at a glance'],
  ['trade', 'Trades and free agents'],
  ['bulk', 'Bulk changes'],
  ['importteam', 'Importing a team'],
  ['check', 'Checking a ROM'],
  ['compare', 'Comparing two ROMs'],
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
          Pick a team from the list on the left, or one of the entries below the teams, such as{' '}
          <b>Rink colours</b>, <b>Game settings</b> or <b>Spreadsheet files</b>.
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
      <p>
        To trade a skater, tick them, choose the other team beside <b>Move ticked to</b>, and click it. A forward
        joins the end of the other team's forwards and a defenceman the end of its roster, and both teams' lines are
        kept in step. Goalies cannot be moved this way; copy one and paste over a goalie on the other team.
      </p>
      <p>
        <b>Show in order of</b> lists the players by name, jersey number or overall rating, and <b>Find</b> shows
        only those whose name contains what you type. Both change only what you see. The roster itself stays in the
        order the game uses, and the move buttons are switched off until you return to roster order with nothing in
        Find.
      </p>

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

      <h3 id="help-pictures">Logos and banners</h3>
      <p>
        At the bottom of a team's page are its four pictures: the <b>centre-ice logo</b>, the <b>menu logo</b>, the{' '}
        <b>menu banner</b> and the <b>in-game banner</b>. They are changed outside the editor:
      </p>
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
        The game stores each picture as 8 by 8 pixel tiles and keeps only one copy of tiles that are the same, so
        plain areas and repeated shapes take less room than fine detail. The room is limited and shared: in the
        original game, the menu logos of all teams have space for only about eleven more tiles between them, and the
        banners have none to spare beyond what the replaced banner frees. If a picture does not fit, the editor says
        so and changes nothing.
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
        <b>Copy to another team</b>, at the foot of a team's page, copies its colours, its logos and banners, or
        both, over another team's. It is a quick way to start a new team from one that looks similar.
      </p>

      <h3 id="help-picturefiles">Picture files</h3>
      <p>
        <b>Picture files</b> handles every team's logos and banners at once, as the spreadsheet files do the rest.
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
        have grown; the space meter will say so. Giving rosters or pictures more room is not something a reset
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
        <li>Importing a workbook follows the same rules, and problems are listed by sheet and row.</li>
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

      <h3 id="help-project">Project files</h3>
      <p>
        A <b>project file</b> holds all your work without the ROM: every team, the colours, the game settings, the
        pictures you replaced and your free agents. <b>Save project file</b> on the Project file page downloads it,
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
        very same file: opened over a different copy, the project's teams, colours and settings replace that copy's,
        and the pictures you had replaced are replaced there too, while pictures you had left alone stay as that
        copy has them.
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
          in any order. Click a team in the results to go to it.
        </li>
        <li>
          <b>How the teams compare</b> is a table of overall ratings, as the game shows them, averaged for each
          team. <b>First line</b> is the five skaters on the NLC line, the one that plays when line changes are
          off, and <b>Its goalie</b> is that line's goalie; for a league that plays without line changes these two
          numbers are the team. The rest cover the whole roster. Click a heading to sort by it. Numbers well above
          or below the league average are coloured, to pick out stacked and thin teams.
        </li>
      </ul>

      <h3 id="help-trade">Trades and free agents</h3>
      <p>
        The <b>Trade</b> page exchanges players between two sides. Choose a team for each, tick the players each
        gives up, and the page shows what the trade would do before you make it: each team's size, the rating of
        its first line and of its skaters, and its best goalie, before and after. Either side can give nothing,
        which makes it a plain move.
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
        <b>Free agents</b> are players you are holding on no team. Choose Free agents as one side to release a
        player to them or to sign one from them; a goalie can be swapped with a free-agent goalie. They are part of
        your work, kept in this browser and in a project file, but they are <b>not in the ROM</b>: a downloaded ROM
        has only the players on teams, and Check ROM reminds you when some are waiting. They are not in the
        spreadsheet files either.
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
        Ratings have seven steps, which the game shows as ranges such as 81-98, so "raise by 1" moves a player up
        one range. Hand, fighting and the goalie values the game does not use are not offered.
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
          The two ROMs can be different kinds, such as the original game and the 30-team ROM. The teams do not have
          to be in the same place in both.
        </li>
        <li>
          Each picture is brought in separately, and the page says which made it. One that needs more room than
          the ROM has is left alone; give the logos and banners more room on any team's page and import again.
          Banners that every team shares in this ROM are also left alone.
        </li>
        <li>The centre-ice logo is drawn with the home colours, so bring the colours with it.</li>
        <li>A bigger roster needs more room; the space meter shows whether it fits.</li>
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
          players sharing a jersey number, an attribute outside its normal range, a name with no space, or a team
          twice in one playoff draw.
        </li>
      </ul>
      <p>
        Click a team's name in the list to go to it. Nothing here stops you downloading, and it is worth a look
        after importing spreadsheet files.
      </p>

      <h3 id="help-compare">Comparing two ROMs</h3>
      <p>
        <b>Compare ROMs</b> describes how what is in the editor differs from another ROM you choose, such as last
        season's. The other ROM is only read. Teams are matched by their place in the list, and players by name, so
        it reports players added, removed and renamed, changed numbers and attributes, line changes, and changes to
        colours and game settings.
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
        summary. Logos and banners are not compared.
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
      <p>
        League and season ROMs built on the 30-team hack open as that, whatever their size of roster, and so do
        hacks that put fewer skaters on the ice. The editor changes only the data it understands and leaves a
        hack's altered game code exactly as it is, so what a hack does differently keeps working.
      </p>
      <p>
        Hacks have been tested less widely here than the original game: the editor can read what they changed but
        cannot know everything they rely on. Keep a copy of the file you opened, and try a download in the game
        before you hand it to anyone.
      </p>
      <p>
        Hacks that put fewer skaters on the ice are played with line changes off, and are known to crash with them
        on. That is how those hacks behave, not something the editor causes or can fix. Only the first line, NLC,
        is used in them. Roster edits to one of these ROMs have been checked in the game. A team's page has a
        notice at the top when the ROM is one of these.
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
              Each team has a fixed amount of room of its own. The space meter shows the room left on the fullest
              team, and a team that outgrows its room has to be trimmed before the ROM can be downloaded.
            </li>
            <li>
              The colour previews are drawn with the original game's player artwork, which that hack has redrawn, so
              they show roughly where each colour goes, not exactly.
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
          Team logos and banners can be replaced. Other graphics, such as player sprites, player photos and the title
          screens, cannot.
        </li>
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
    </main>
  )
}
