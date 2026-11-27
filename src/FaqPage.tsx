import { MAX_ROSTER } from './core/roster'

// Questions people ask, answered short, with where to look for more. The labels quoted are the pages' own: keep them
// in step when a page changes.

export function FaqPage() {
  return (
    <main className="team help" data-no-tabs>
      <h2>FAQ</h2>
      <p className="note">
        Short answers to common questions. Walkthroughs has the common jobs step by step, and Help says what each page
        does.
      </p>
      <dl>
        <dt>Is my ROM sent anywhere?</dt>
        <dd>No. It is read and changed in this browser tab only, and no ROM comes with the site.</dd>

        <dt>I closed the tab. Is my work gone?</dt>
        <dd>
          No. Open the site again in the same browser and choose <b>Continue editing</b>. Clearing the browser's site
          data loses it, so for safety, or for another computer, save a project file (<b>Project file</b>, then{' '}
          <b>Save project file</b>).
        </dd>

        <dt>A page says "This part of the page could not be shown". Is my work gone?</dt>
        <dd>
          No. Something went wrong drawing that page only: your ROM and every change are still there. Choose another page
          on the left, or <b>Try again</b>. <b>Copy the details</b> and send them, with the page, the section you clicked
          and the ROM, so that it can be fixed. If it says the page could not be loaded, the site was updated while
          your tab was open: reload, then choose <b>Continue editing</b>.
        </dd>

        <dt>What is the difference between the ROM, a project file and a patch?</dt>
        <dd>
          The downloaded ROM is the game to play, with every change in it. A project file is your work without the ROM:
          open the same ROM, then the project file, to carry on, on any computer. It also keeps what a ROM cannot: the
          free agents, the season's starting point and your league's rules. A patch (<b>Download patch</b>, .ips) holds
          only your changes, for players who have the ROM you started from.
        </dd>

        <dt>My changes don't show in the game.</dt>
        <dd>
          Check that you chose <b>Download ROM</b> and opened the new file in the emulator, not the old one; downloads
          with the same name can get a number added, such as <i>Season_12 (1)</i>. Hacks change nothing until you
          choose <b>Apply</b> on the Hacks page. Then start a new game from the menu: a game loaded from a save state
          made earlier can still have the old rosters.
        </dd>

        <dt>Undo: what does it take back?</dt>
        <dd>
          The last change, on any page. A whole season brought in, a trade, or an Apply on the Hacks page is one step.{' '}
          <b>Redo</b> brings it back.
        </dd>

        <dt>Why do the ratings show as 0 to 6?</dt>
        <dd>
          The game plays each rating as one of seven steps, and 0 to 6 is the plainest way to show them. Choose the
          game's ranges under <b>Show attributes as</b> if you prefer what the player cards say.
        </dd>

        <dt>Why can't I add a player, or make a name longer?</dt>
        <dd>
          A team holds at most {MAX_ROSTER} players, so the <b>Add forward</b>, <b>Add defenceman</b> and{' '}
          <b>Add goalie</b> buttons are greyed out at {MAX_ROSTER}. Names and
          players also share one fixed room in the ROM: the figure at the top of the page says how much is left. When
          the editor can make more room, a button at the top offers it, such as <b>Add 934 bytes of roster space</b>.
          Otherwise, shorten a name somewhere else. Help's <i>Space in the ROM</i> has more.
        </dd>

        <dt>A team is missing from the Game Setup menu.</dt>
        <dd>
          The menu offers only the first teams in the team list, as many as <b>Teams in the menu</b> on Game settings
          says. Raise that number, or move the team up with <b>Move teams</b> on Bulk changes.
        </dd>

        <dt>A hack says "This ROM has an earlier version of it".</dt>
        <dd>
          NOSE4Web has improved that hack since it went into this ROM (Clockwise's stick tape, giveaways, the season
          shootout and others). <b>Put in the current version</b> beside it updates it; nothing else changes, and Undo
          takes it back.
        </dd>

        <dt>A hack is greyed out: "This ROM has other changes in this part of the game".</dt>
        <dd>
          Something other than the original game's code is where that hack goes, so NOSE4Web leaves it alone rather than
          risk breaking it: another tool's patch, or a build of the game it does not know yet. If you think the option
          should work on your ROM, send the ROM: often NOSE4Web only needs to learn that build (as for a later SA-1 60
          fps build, whose energy options were greyed out until 26 November 2026).
        </dd>

        <dt>Which bug fixes should a league use?</dt>
        <dd>
          On Hacks, <b>Turn on the recommended fixes</b> picks the ones most leagues use. Each option says whether the
          NHL94 Match Viewer project has tested it in the game, so you can try the others on their own first.
        </dd>

        <dt>The same player is rated very differently in two seasons. Is that right?</dt>
        <dd>
          Yes. Real NHL season rates each player from that one season's stats, against that season's players. A rookie
          season and a scoring-title season give very different ratings, as they should. Walkthroughs'{' '}
          <i>How Real NHL season rates players</i> has the whole method.
        </dd>

        <dt>Can I make a real NHL season from my league's ROM?</dt>
        <dd>
          Start from the original game, or on the SNES the SA-1 build. A league ROM with code changes of its own may not
          take one as cleanly. To keep your league's teams and only give the players a season's ratings, use{' '}
          <b>Re-rate the players this ROM has</b> on Real NHL season.
        </dd>

        <dt>A team from a real season shows another city's banner or logo.</dt>
        <dd>
          Real NHL season puts each team where its franchise is in the ROM, so the 1987-88 Minnesota North Stars go where
          the original game has the Dallas Stars. On NHL 94 for the Genesis their banners are lettered with their city;
          the notes after bringing the season in name every team still showing another city's banner (always on the
          SNES) or another team's logo. Change those on the team's page, under <b>Logos and banners</b>, or bring them
          from another ROM with <b>Import a team</b>.
        </dd>

        <dt>Can I change the music?</dt>
        <dd>
          Yes, on <b>Game settings</b>, under its Music tab: the organ songs the teams play and the game's other music.{' '}
          <b>Replace</b> puts a MIDI file of your own in; <b>Edit</b> opens a piece in the music editor, to change its
          notes on a piano roll first. Walkthroughs' <i>Change a song or the game music</i> takes you through it.
        </dd>

        <dt>Can each team have its own rink?</dt>
        <dd>
          Partly. On NHL 94 for the Genesis, <b>Each home team's rink colours</b> on the Rink colours page gives each home
          team its own boards trim and red markings. The rink's other colours are shared with the score box, the clock,
          the EA logo and the crowd, so they stay the same for every team. The rink's picture itself (Import a PNG) is
          the same for every team.
        </dd>

        <dt>Can each team have its own song before the game?</dt>
        <dd>
          On the Genesis, yes: <b>Pre-game songs</b> on Game settings' Music tab picks the music the matchup screen plays
          when each team is at home. Organ songs play once and stop; the game's own music plays until the game starts.
          Not on the SNES, whose matchup screen keeps the menu music playing.
        </dd>

        <dt>Why does the music editor show red on the game's own songs?</dt>
        <dd>
          Red marks where more notes sound at once than NOSE4Web puts into the ROM: 4 on the organ in NHL 94 and on the
          SNES, 7 in NHL '95, and the console's own limits for the game music. The game's own songs were written with
          more in places, and the console drops some of them as it plays. Where there is red, the extra notes (usually
          the lowest) are left out or cut short when the piece goes in.
        </dd>

        <dt>Can NOSE4Web make our league's schedule?</dt>
        <dd>
          Yes: <b>Schedule maker</b> on the League page. Tick the teams, say how often each pair meets (more often within a
          group, if you give teams groups), and save the games as a spreadsheet for your site. It shares home and away
          out evenly and never has a team play twice in one game day. The ROM is not changed.
        </dd>

        <dt>Does it work with 3-on-3, 2-on-2 and other league ROMs?</dt>
        <dd>
          Yes, for editing: most league ROMs built on the original games open like any other, including the SNES 2 on 2
          and pond hockey (3 on 3) ROMs. A ROM that leaves positions empty on every line keeps them empty when the
          editor builds lines. Help's <i>Supported ROMs and limits</i> lists what is known not to work.
        </dd>

        <dt>Why do SNES players play better than their ratings?</dt>
        <dd>
          Because of the SNES game's hot and cold bug, about half of every player's ratings are at the maximum each
          game, whatever they are in the ROM. The Hacks page has a fix for it, for leagues that want it. Help's{' '}
          <i>What the ratings do in play</i> explains it.
        </dd>
      </dl>
    </main>
  )
}
