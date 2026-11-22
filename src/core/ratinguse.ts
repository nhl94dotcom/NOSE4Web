// What each rating does in play on the Genesis, keyed by its column label.
// From the NHL94 Match Viewer project, which read every place the game's code
// (github.com/abdulahmad/NHL94Genesis) uses each rating and checked much of
// it against recorded games. A rating counts five times its value in play,
// give or take a little for being hot or cold.

export const SKATER_RATING_USES: Record<string, string> = {
  // CCStart: 120 (240 for a checker a person controls), minus 8 x his Weight, plus 8 x the hit man's, halved,
  // less the hit's impact; byte arithmetic, so at 240 a man 16 lb or more heavier wraps round (the weight bug).
  Wgt: "how quickly he speeds up (heavier is slower), collisions, and checks: the heavier the checker than the man he hits, the likelier a knockdown. In the original game a man you control knocks down almost anyone 16 pounds or more heavier than himself (the weight bug; see Hacks)",
  Agl: 'how quickly he speeds up and turns',
  Spd: 'top speed',
  OfA: 'how quickly computer players react when chasing a loose puck or the man with it, when carrying the puck (deciding to shoot or pass), and as a defenceman whose team has the puck; the team ratings and the comeback bonus change it',
  DfA: "how quickly computer players react in their other jobs: a defenceman covering a rush, and wingers and centres whether or not their team has the puck (the original game uses Defensive Awareness for forwards on offence too; the computer forwards' awareness option changes that)",
  // ShotMode: speed 15 +1 a frame held; a working ShP under 20 ends the windup sooner (about 31 against 35);
  // one-timers 31, backhands x 3/4; then x (20 + ShP / 2) by energy.
  ShP: 'shot speed: a 6 shoots about twice as hard as a 0. At 5 or 6 he can wind a slapshot up longer, for about an eighth more speed; at 4 only when he is not cold, at 3 or less never. One-timers always get the shorter windup, and backhands lose a quarter',
  // CCStart: a check needs an impact of 20 or more; after the weight sum, a roll of 0 to that sum less one
  // knocks down if it is no more than his working Chk / 2 (0-15).
  Chk: 'how often his checks knock a man down: after the hit and the weights, a 6 wins the last roll many times as often as a 0. Also whether he can upend a man (4 or more), and how often a computer player tries to check or goes after the man with the puck',
  // setInjuryType: the checker's fighting byte / 4. 0 the period, 3 the game, 1 or 2 the game only when the
  // injured man's fighting byte has bit 1 set (chkFgtBit1). FallDown .21: only a puck carrier falling back.
  'H/F': "shooting hand, and how long the players they injure are out: at fighting 0 or 14 for the period, at 85 or 100 for the game, and in between for the game only if the injured man's own fighting is 14, 42, 71 or 100. A hit can only injure a player carrying the puck who is knocked onto their back with the clock running, and the harder the hit the likelier",
  // puckstick's catch limit is 13,000 + 350 x his working value (0-30); FallDown's stumble needs 24 or more, a
  // roll of 16-31 above the hit's impact, and not a hit into the boards. Steals: Match Viewer's test.
  StH: 'catching passes and loose pucks: the higher it is, the faster a puck he can stop on his stick rather than have it bounce off, up to about 1.8 times as fast at 6 as at 0 (shots get no help); stumbling rather than falling when hit, only at 5 or more (4 with the power play, home or hot bonuses), a chance that shrinks the harder the hit, and never when knocked into the boards; and, after a steal, how long before either player can touch the puck again. Whether a steal happens barely depends on it',
  // doshot: within 200 pixels of the aim spot, perfect if a roll of 0 to 15 + working ShA is over 14, so
  // (ShA + 1) / (ShA + 16); always in highlights, shootouts and with the shooter's goalie pulled. Otherwise a
  // spread of (speed / 16 + 16 - ShA / 2) x distance / 64.
  ShA: 'how often a shot goes exactly where it is aimed, which can only happen from about the blue line in: about 1 time in 10 at 0, 4 in 10 at 2, 6 in 10 at 4 and 2 in 3 at 6, a little more on the power play. Shootout shots, and shots with his own goalie pulled, always go exactly. Otherwise it strays, more the farther out and the harder the shot; a 6 strays about a sixth as far as a 0',
  End: 'how fast he tires, which only matters with line changes on',
  Rgh: 'for a computer puck carrier, how readily he shoots rather than passes (the game calls it the pass / shoot bias)',
  Pas: 'pass speed only: passes always go where they are aimed',
  Agr: 'how often he takes penalties; the original game wraps it round, so a 4 plays like a 1 and a 6 or a 3 is penalised most, though the spread is only about 1.5 to 1 (see the Aggression bug fix under Hacks)',
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
  // puckstick: 10,000 + 700 x his working value (0-15), 3,000 more for the man the pass is aimed at; FallDown:
  // 12 or more, a roll of 10-25 at least the impact, not with the clock stopped.
  StH: 'catching passes and loose pucks: the higher it is, the faster a puck he can stop on his stick, up to about twice as fast at 6 as at 0, and the man a pass is aimed at gets a little more (shots get no help); stumbling rather than falling when hit, only at 5 or more (4 when hot or with bonuses), a chance that shrinks the harder the hit, and never after the whistle; and, after a steal, how long before either player can touch the puck again',
  Pas: 'how steady a pass\'s speed is, the speed of a pass to nobody, and how accurately the flip goes',
  Agr: 'how often he takes penalties; a bug in the SNES penalty roll makes a player you control at a working value of 12 (about a rating of 5) draw a penalty on every contact',
}

export const SNES_GOALIE_RATING_USES: Record<string, string> = {
  Agl: 'how quickly he speeds up; unlike on the Genesis, not how far he reaches. A goalie the computer controls loses it while a pass is in the air',
  DfA: 'for a goalie the computer controls, how quickly he moves to cut down the angle; every pass slows him by half of it',
  PkC: 'how hard a shot he can hold rather than let bounce off him; the SNES goalie holds softer shots than the Genesis one, and a diving goalie can still hold a low puck',
  StR: 'nothing: the game looks it up and then overwrites it',
  StL: 'nothing: the game looks it up and then overwrites it',
  GvR: 'nothing: the game looks it up and then overwrites it',
  GvL: 'nothing: the game looks it up and then overwrites it',
}

export function ratingUse(label: string, isGoalie: boolean, platform: 'genesis' | 'snes' = 'genesis'): string {
  const snes = platform === 'snes' ? (isGoalie ? SNES_GOALIE_RATING_USES : SNES_SKATER_RATING_USES)[label] : undefined
  return snes ?? (isGoalie ? GOALIE_RATING_USES : SKATER_RATING_USES)[label] ?? ''
}
