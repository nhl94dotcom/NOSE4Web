// Walkthroughs: common jobs step by step, in the order that works, for commissioners new to the editor. The Help
// page says what each page does; this one says which pages to use, in what order, to get a job done. The labels
// quoted are the pages' own: keep them in step when a page changes.

const CONTENTS: [string, string][] = [
  ['first', 'Your first edit, start to finish'],
  ['season', 'A ROM of a real NHL season (1987-88)'],
  ['copy', "Copy one player's ratings onto another"],
  ['moves', 'Move, trade and release players'],
  ['lines', 'Lines'],
  ['hacks', 'Bug fixes and game options (Hacks)'],
  ['looks', 'Team names, colours and logos'],
  ['before', 'Before a season starts: check and compare'],
  ['newseason', 'From one league season to the next'],
  ['save', 'Saving work, and picking it up later'],
  ['sheets', 'Rosters in a spreadsheet'],
  ['faq', 'Questions'],
]

export function GuidesPage() {
  return (
    <main className="team help" data-no-tabs>
      <h2>Walkthroughs</h2>
      <p className="note">
        Common jobs, step by step, in the order that works. Help says what each page does; here is which pages to use,
        and when. Names in bold are the editor's own buttons and pages.
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
          tab, and you download the result.
        </li>
        <li>
          Choose <b>Open ROM…</b> and pick the ROM (Genesis .bin or .smd, SNES .smc or .sfc). Nothing is uploaded.
        </li>
        <li>
          In the <b>Name</b> box at the top, type a name for the new ROM, such as <i>Season_12</i>. The download takes
          this name; left as it is, it has the same name as the ROM you opened.
        </li>
        <li>
          Pick a team under <b>Teams</b>. On its page, change a player's name, number or ratings in the table. Ratings
          show as 0 to 6 by default; <b>Show attributes as</b> also offers the ranges the game's own screens show (25-29
          to 99) and the values stored in the ROM (0-15). This changes only how they show.
        </li>
        <li>
          Made a mistake? <b>Undo</b> (Ctrl+Z) and <b>Redo</b> (Ctrl+Y) at the top work across every page.
        </li>
        <li>
          Look at <b>Check ROM</b> under Review: a number beside it means problems to fix before playing.
        </li>
        <li>
          Choose <b>Download ROM</b>. (<b>Download patch</b> gives an .ips patch of your changes instead, for players
          who have the original ROM.)
        </li>
      </ol>

      <h3 id="guide-season">A ROM of a real NHL season (1987-88)</h3>
      <p>
        The aim: the 21 teams of 1987-88, with that season's players rated from their stats, its names, its rules for
        tied games, and a menu and playoffs of those 21 teams. Start from the original NHL 94 (or a league ROM built on
        it). Each step is one Undo, so you can try freely.
      </p>
      <ol>
        <li>
          <b>Open the ROM</b> and type a name in the <b>Name</b> box, such as <i>NHL_1987-88</i>.
        </li>
        <li>
          Go to <b>Real NHL season</b> (under League administration) and choose <b>Season</b> 1987-88.
        </li>
        <li>
          Choose how many <b>Goalies</b>, <b>Forwards</b> and <b>Defence</b> each team gets (2, 15 and 8 to begin with).
          Leave <b>Use that season's team names</b> ticked: the Dallas Stars become the Minnesota North Stars, and the
          initials follow (LAK, NJD, WIN). Tick <b>Fill the All-Star teams with that season's best players of each
          conference</b> to make the All-Star teams that season's best of the Wales and the Campbell.
        </li>
        <li>
          Look over <b>Where each team goes</b>. Each 1987-88 team goes where the ROM has the same team or franchise:
          the North Stars where the Dallas Stars are, the Nordiques where Quebec is. The five teams that came later
          (Anaheim, Florida, Ottawa, San Jose and Tampa Bay) say <b>Keep as it is</b>. If the page says a team goes
          where the menu cannot pick it, carry on: step 7 deals with it.
        </li>
        <li>
          Choose <b>Bring in 21 teams from 1987-88</b>. Each team gets the players with the most games for it, new
          lines, and team ratings from its goals for and against and its power play and penalty kill. The list after
          says what was done.
        </li>
        <li>
          Under <b>That season's rules</b>, choose <b>Set the rules to 1987-88's</b>: in 1987-88 a tied game played an
          overtime and then ended in a tie, and the original game already plays it that way, so on it the button says{' '}
          <i>Nothing to change</i>. A season from 2005-06 on gets the shootout, and from 2015-16 on, 3 on 3 overtime.
        </li>
        <li>
          Under <b>Offer only these teams in the menu</b>, choose <b>Offer only the 21 teams of 1987-88 in the menu</b>.
          The 21 teams go to the top of the team list, the main menu offers only them and the All-Star teams, and new
          playoff draws are made of the 21 alone (16 of them make each playoff, as in 1987-88). The five later teams
          stay in the ROM after them, out of the menu. (By hand, this is <b>Move teams</b> on Bulk changes, then{' '}
          <b>Teams in the menu</b> and <b>Fill the draws with the league's teams</b> on Game settings, in that order.)
        </li>
        <li>
          On <b>Game settings</b>, set the <b>Overtime</b> length under Clock, in seconds. The NHL's overtime was 5
          minutes against 20-minute periods, a quarter of a period: 75 for a league that plays 5-minute periods, 150
          for 10, 300 for 20. If you change a period length there, change its menu text too.
        </li>
        <li>
          The looks: names come with the season, but logos, colours and stadium names stay as the ROM had them. For
          1987-88's looks all at once, open a ROM that has them on <b>Import a team</b>, choose <b>Every team at
          once</b>, tick <b>Home and away colours</b> and <b>Logos, banners and banner colours</b>, and bring them in
          (teams are matched by name, so the source ROM needs a team called Minnesota North Stars, and so on). One team
          at a time: its page has <b>Colours</b> and <b>Logos and banners</b>, and the <b>Stadium</b> box for the
          arena.
        </li>
        <li>
          Open <b>Check ROM</b>. After the steps above it should find no problems; if it lists any, each says what to
          do.
        </li>
        <li>
          Choose <b>Download ROM</b>. On <b>Project file</b>, <b>Save project file</b> as well, to keep the work
          in a file of its own, without the ROM.
        </li>
      </ol>
      <p>
        Ratings only, keeping the ROM's teams: under <b>Re-rate the players this ROM has</b>, the same page gives every
        player it finds by name that season's ratings and leaves everything else alone, such as for a league whose
        rosters are already made up.
      </p>
      <p className="note">
        The ratings are each player's in that one season: where they stood among that season's players. The same
        player differs from season to season, as they did. Speed, Agility and Checking are the least sure, as no stat
        measures them; change any player on their team's page after.
      </p>

      <h3 id="guide-copy">Copy one player's ratings onto another</h3>
      <ol>
        <li>
          From the <b>League</b> page: type part of the name in <b>Find a player</b>, tick the player in the{' '}
          <b>Copy</b> column, and choose <b>Copy the ticked player</b>. Ticks stay as you search for others, so
          several can be copied together.
        </li>
        <li>
          Or from a team's page: tick the player and choose <b>Copy selected</b>.
        </li>
        <li>
          On the team page of the player to change, tick them and choose <b>Paste attributes only</b>: they keep their
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
          <b>A trade:</b> on <b>Trade</b>, choose the two teams, tick the players each side gives up, read{' '}
          <b>What it would do</b> (roster limits, the lines that need a look after), then <b>Make this trade</b>.
          Goalies can be part of it.
        </li>
        <li>
          <b>Free agents:</b> <b>Release selected</b> on a team's page lets players go; they wait as free agents (the
          Trade page shows how many) until signed with <b>Sign</b>. Free agents are kept in this browser and in a
          project file, not in the ROM.
        </li>
      </ul>

      <h3 id="guide-lines">Lines</h3>
      <ul>
        <li>
          A team's page, <b>Lines</b>: <b>Build all lines</b> makes every line from the roster's ratings;{' '}
          <b>Fix broken lines</b> fills only places left empty or holding a player who has gone.
        </li>
        <li>
          Every team at once: <b>Bulk changes</b>, <b>Build every team's lines</b> or <b>Fix broken lines only</b>.
        </li>
        <li>After trades and moves, Check ROM points out lines with a place no valid player holds.</li>
      </ul>

      <h3 id="guide-hacks">Bug fixes and game options (Hacks)</h3>
      <ol>
        <li>
          Open <b>Hacks</b>. <b>Turn on the recommended fixes</b> picks the bug fixes most leagues use.
        </li>
        <li>
          Change any options you like. Nothing in the ROM changes yet: a bar says how many changes are waiting.
        </li>
        <li>
          Choose <b>Apply</b>. Leave the page without applying and the editor keeps your choices and reminds you; a
          download asks first.
        </li>
      </ol>
      <p className="note">Each option says whether the NHL94 Match Viewer project has tested it in the game.</p>

      <h3 id="guide-looks">Team names, colours and logos</h3>
      <ul>
        <li>
          A team's page: <b>Location</b>, <b>Initials</b>, <b>Name</b> and <b>Stadium</b>; the <b>Colours</b> for home
          and away; <b>Logos and banners</b>, to draw, or to import a picture file.
        </li>
        <li>
          Many teams at once: <b>Import a team</b> brings names, rosters, colours, logos and banners from another ROM,
          one team or every team; <b>Picture files</b> exports every picture to a .zip and imports them back, to edit
          in a paint program.
        </li>
      </ul>

      <h3 id="guide-before">Before a season starts: check and compare</h3>
      <ol>
        <li>
          <b>Check ROM</b> lists problems (things that can go wrong in the game), your league's rules broken, and
          notes. <b>Your league's rules</b> on that page sets limits such as the most a player can be rated.
        </li>
        <li>
          <b>Compare ROMs</b>: choose <b>Compare with a ROM…</b> and pick last season's ROM to see every change, and{' '}
          <b>Download report</b> for a text file to post for the league.
        </li>
      </ol>

      <h3 id="guide-newseason">From one league season to the next</h3>
      <ol>
        <li>Open last season's ROM (or its project file, on Project file).</li>
        <li>
          On <b>New season</b>, start the new season. It names the work after the new season and can first save a
          project file of the one just ended.
        </li>
        <li>
          Make the season's changes: trades, ratings, rookies (tick new players on a team's page and use{' '}
          <b>Make up attributes</b>, then <b>Make</b>, for believable ratings of the kind and level you choose).
        </li>
        <li>
          <b>Changes</b> lists everything changed since the season began, however often you close the editor in
          between; download it as a report for the league.
        </li>
      </ol>

      <h3 id="guide-save">Saving work, and picking it up later</h3>
      <ul>
        <li>
          This browser keeps your work as you go. Open NOSE4Web again and choose <b>Continue editing</b>.
        </li>
        <li>
          For another computer, or to be safe: <b>Project file</b>, <b>Save project file</b>. Later, open the same ROM
          and choose <b>Open a project file…</b>.
        </li>
        <li>
          The ROM itself: <b>Download ROM</b>. A downloaded ROM opens in the editor again with everything in it but
          the free agents, which only a project file keeps.
        </li>
      </ul>

      <h3 id="guide-sheets">Rosters in a spreadsheet</h3>
      <ol>
        <li>
          On <b>Spreadsheet files</b>, export the rosters as an Excel workbook or as CSV files.
        </li>
        <li>Edit them in Excel, Google Sheets or LibreOffice, keeping the columns as they are.</li>
        <li>
          Import them back on the same page (<b>Import a workbook…</b> or <b>Import files…</b>). Check ROM after.
        </li>
      </ol>
      <p className="note">
        The same page makes the league website's players file (<b>League website players file</b>).
      </p>

      <h3 id="guide-faq">Questions</h3>
      <dl>
        <dt>Why do the ratings show as 0 to 6?</dt>
        <dd>
          The game keeps each rating as one of seven steps. 0 to 6 is the plainest way to show them; choose the game's
          ranges under <b>Show attributes as</b> if you prefer what the player cards say.
        </dd>
        <dt>The same player is rated very differently in two seasons. Is that right?</dt>
        <dd>
          Yes. Real NHL season rates each player from that one season's stats, against that season's players: a rookie
          season and a scoring-title season give very different ratings, as they should.
        </dd>
        <dt>Does it work with 3-on-3, 2-on-2 and other league ROMs?</dt>
        <dd>
          Most league ROMs built on the original games open as any other. A ROM that leaves positions empty on every
          line (3 on 3, 2 on 2) keeps them empty when the editor builds lines, including for a real season. Help's{' '}
          <i>Supported ROMs and limits</i> lists what is known not to work.
        </dd>
        <dt>Is my ROM sent anywhere?</dt>
        <dd>No. It is read and changed in this browser tab only, and no ROM comes with the site.</dd>
        <dt>I closed the tab. Is my work gone?</dt>
        <dd>
          No: open the site again in the same browser and choose <b>Continue editing</b>. A project file keeps it
          anywhere.
        </dd>
        <dt>Where does a change go when I press Undo?</dt>
        <dd>
          Back to just before it, on any page: a whole season brought in, a trade or a hack apply is one step.{' '}
          <b>Redo</b> brings it back.
        </dd>
      </dl>
    </main>
  )
}
