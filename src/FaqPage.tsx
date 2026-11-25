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
