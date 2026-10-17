// What each rating does in play on the Genesis, keyed by its column label.
// From the NHL94 Match Viewer project, which read every place the game's code
// (github.com/abdulahmad/NHL94Genesis) uses each rating and checked much of
// it against recorded games. A rating counts five times its value in play,
// give or take a little for being hot or cold.

export const SKATER_RATING_USES: Record<string, string> = {
  Wgt: 'how quickly he speeds up (heavier is slower), whether checks knock players down, and collisions',
  Agl: 'how quickly he speeds up and turns',
  Spd: 'top speed',
  OfA: "how quickly computer players react on offence; the home, away, power play and penalty kill ratings and the comeback bonus add to it",
  DfA: 'how quickly computer players react on defence',
  ShP: 'shot speed; at 3 or less he cannot wind up a full slapshot',
  Chk: 'how often his checks knock a man down, and how often a computer player tries to check',
  'H/F': 'shooting hand, and how long the players he injures are out',
  StH: 'stealing and keeping the puck, catching hard passes, and stumbling rather than falling when hit',
  ShA: 'how often a shot goes exactly where it is aimed, and how far it strays if not',
  End: 'how fast he tires, which only matters with line changes on',
  Rgh: 'for a computer puck carrier, how readily he shoots rather than passes (the game calls it the pass / shoot bias)',
  Pas: 'pass speed only: passes always go where they are aimed',
  Agr: 'how often he takes penalties; the original game wraps it round, so a 4 plays like a 1 and a 3 is penalised most (see the Aggression bug fix under Hacks)',
}

export const GOALIE_RATING_USES: Record<string, string> = {
  Wgt: 'how quickly he speeds up',
  Agl: 'how quickly he moves, and how far he reaches for a save',
  Spd: 'top speed',
  OfA: 'how quickly he reacts',
  DfA: 'how quickly he re-aims at the puck',
  PkC: 'how often he holds on to a shot rather than giving a rebound',
  GlH: 'which hand his glove is on',
  StR: 'nothing: the game looks it up and never uses it',
  StL: 'nothing: the game looks it up and never uses it',
  GvR: 'nothing: the game looks it up and never uses it',
  GvL: 'the reaching glove save, which takes 11 or more in play; in the original game this wraps round like Aggression, so a 3 allows it and a 4 does not',
}

export function ratingUse(label: string, isGoalie: boolean): string {
  return (isGoalie ? GOALIE_RATING_USES : SKATER_RATING_USES)[label] ?? ''
}
