// What each rating does in play on the Genesis, keyed by its column label.
// From the NHL94 Match Viewer project, which read every place the game's code
// (github.com/abdulahmad/NHL94Genesis) uses each rating and checked much of
// it against recorded games. A rating counts five times its value in play,
// give or take a little for being hot or cold.

export const SKATER_RATING_USES: Record<string, string> = {
  Wgt: 'how quickly he speeds up (heavier is slower), whether checks knock players down, and collisions',
  Agl: 'how quickly he speeds up and turns',
  Spd: 'top speed',
  OfA: 'how quickly computer players react when chasing a loose puck or the man with it, when carrying the puck (deciding to shoot or pass), and as a defenceman whose team has the puck; the team ratings and the comeback bonus change it',
  DfA: 'how quickly computer players react in their other jobs: a defenceman covering a rush, and wingers and centres whether or not their team has the puck (the game uses Defensive Awareness for forwards on offence too, a slip in its code)',
  ShP: 'shot speed; at 3 or less he cannot wind up a full slapshot',
  Chk: 'how often his checks knock a man down, whether he can upend a man (4 or more), and how often a computer player tries to check or goes after the man with the puck',
  'H/F': 'shooting hand, and how long the players he injures are out',
  StH: 'stealing and keeping the puck, catching hard passes, and stumbling rather than falling when hit',
  ShA: 'how often a shot goes exactly where it is aimed, and how far it strays if not',
  End: 'how fast he tires, which only matters with line changes on',
  Rgh: 'for a computer puck carrier, how readily he shoots rather than passes (the game calls it the pass / shoot bias)',
  Pas: 'pass speed only: passes always go where they are aimed',
  Agr: 'how often he takes penalties; the original game wraps it round, so a 4 plays like a 1 and a 3 is penalised most (see the Aggression bug fix under Hacks)',
}

export const GOALIE_RATING_USES: Record<string, string> = {
  Wgt: 'how quickly he speeds up, and collisions',
  Agl: 'how quickly he speeds up, and how far he reaches for a save',
  Spd: 'top speed',
  OfA: 'no use for goalies has been found',
  DfA: 'for a goalie the computer controls, how quickly he moves to cut down the angle and goes after loose pucks',
  PkC: 'how often he holds on to a shot rather than giving a rebound',
  GlH: 'which hand his glove is on',
  StR: 'nothing: the game looks it up and never uses it',
  StL: 'nothing: the game looks it up and never uses it',
  GvR: 'nothing: the game looks it up and never uses it',
  GvL: 'the reaching glove save, which takes 11 or more in play; in the original game this wraps round like Aggression, so a 3 allows it and a 4 does not',
}

// Where the SNES game differs. It counts a rating as two and a half times its
// value, and its hot and cold bug puts about half of every player's ratings at
// the maximum each game, whatever they are in the ROM.
export const SNES_SKATER_RATING_USES: Record<string, string> = {
  Wgt: 'how quickly he speeds up (heavier is slower, though less so than on the Genesis), and collisions; the SNES has no weight bug',
  Agl: 'how quickly he speeds up, turns and stops',
  Spd: 'top speed, cut by up to half as he tires, which only happens with line changes on',
  ShP: 'shot speed; unlike on the Genesis, a weak shooter can still take a full slapshot',
  Chk: 'how often his checks knock a man down, and how often a computer player tries to check, which on the SNES is very often',
  'H/F': 'shooting hand only: the SNES never reads the fighting half',
  Pas: 'pass speed, and how accurately the flip goes',
  Agr: 'how often he takes penalties; a bug in the SNES penalty roll makes a player you control at a working value of 12 (about a rating of 5) draw a penalty on every contact',
}

export const SNES_GOALIE_RATING_USES: Record<string, string> = {
  Agl: 'how quickly he speeds up; unlike on the Genesis, not how far he reaches. A goalie the computer controls loses it while a pass is in the air',
  DfA: 'for a goalie the computer controls, how quickly he moves to cut down the angle; every pass slows him by half of it',
  PkC: 'on the Genesis, how often he holds on to a shot rather than giving a rebound; not yet confirmed on the SNES',
  StR: 'nothing: the game looks it up and then overwrites it',
  StL: 'nothing: the game looks it up and then overwrites it',
  GvR: 'nothing: the game looks it up and then overwrites it',
  GvL: 'nothing: the game looks it up and then overwrites it',
}

export function ratingUse(label: string, isGoalie: boolean, platform: 'genesis' | 'snes' = 'genesis'): string {
  const snes = platform === 'snes' ? (isGoalie ? SNES_GOALIE_RATING_USES : SNES_SKATER_RATING_USES)[label] : undefined
  return snes ?? (isGoalie ? GOALIE_RATING_USES : SKATER_RATING_USES)[label] ?? ''
}
