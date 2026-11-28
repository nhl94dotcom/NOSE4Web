import type { HackChoices } from './hacks'
import type { SnesHack } from './sneshacks'

// How the Hacks pages and the hack sheets group the hacks: the same sections,
// in the same order, on both systems, so that a hack is found in the same
// place on the page as on the sheet a league posts. The Genesis page is
// written out by hand in this order (a test checks it); the SNES page and
// both sheets are built from these lists. NHL '95's page (NHL95_HACK_SECTIONS
// in nhl95hacks.ts) uses the same sections, titles and order.
export interface HackGroup<Key> {
  // For the links at the top of the page.
  id: string
  title: string
  hacks: Key[]
}

export const GENESIS_HACK_GROUPS: HackGroup<keyof HackChoices>[] = [
  {
    id: 'fixes',
    title: 'Fixes',
    hacks: [
      'checkFix', 'secondAssist', 'oneTimerAssist', 'regainAssist', 'aggressionFix', 'ppPkFix', 'comebackFix', 'openNetFix', 'repeatCheckFix', 'passFix',
      'faceoffFix', 'runawayFix', 'penaltyShotTableFix', 'penaltyShotFixes', 'snipingFix', 'goaliePullFix', 'blindRingFix', 'awarenessFix',
      'centreDefenceFix', 'goalieTurnFix', 'goalieBladeFix', 'shotScatterFix', 'crowdFix',
    ],
  },
  { id: 'statistics', title: 'Statistics', hacks: ['stickShots', 'bodychecks', 'plusMinus', 'timeOnIce', 'giveaways', 'blockedShots', 'threeStars', 'intermissionReport'] },
  { id: 'ratings', title: 'Ratings', hacks: ['wideRatings', 'baseWeight', 'bonuses', 'hotColdRange', 'clutchTime'] },
  // Ties and overtime first, then the clock and penalties, then icing.
  { id: 'rules', title: 'Rules', hacks: ['seasonTies', 'nhlShootout', 'shootoutInjuries', 'threeOnThree', 'fourthPeriodOvertime', 'penaltySeconds', 'realTime', 'delayedCalls', 'bCheckPenaltiesOff', 'referees', 'noIcing', 'hybridIcing'] },
  { id: 'fighting', title: 'Fighting', hacks: ['fighting', 'fightSeconds', 'fightMomentum', 'fightOnce'] },
  {
    id: 'energy',
    title: 'Energy and injury risk',
    hacks: ['stamina', 'energyDrain', 'energyRecovery', 'noSkatingDrain', 'burstEnergy', 'hitEnergy', 'holdEnergy', 'injuries', 'injuryBonus', 'injuryCap'],
  },
  { id: 'goalies', title: 'Goalies', hacks: ['goalieHold', 'diveHold', 'goalieWidth', 'goalieOut', 'goalieLine', 'goalieDelay'] },
  { id: 'skating', title: 'Skating and the puck', hacks: ['speedBurst', 'turnRate', 'puckFriction', 'choppyIce'] },
  { id: 'lines', title: 'Edit Lines and controls', hacks: ['fewerSkaterLines', 'anyPosition'] },
  { id: 'looks', title: 'Looks and sound', hacks: ['puckColours', 'netColours', 'greenFan', 'noFans', 'clockwiseSprites', 'barrPick', 'barrCoin', 'introWait', 'headBleeding', 'organResume'] },
  { id: 'legacy', title: 'Legacy hacks', hacks: ['weightFix'] },
]

export const SNES_HACK_GROUPS: HackGroup<SnesHack>[] = [
  {
    id: 'fixes',
    title: 'Fixes',
    hacks: ['hotColdFix', 'ppPkFix', 'comebackFix', 'faceoffFix', 'penaltyShotFixes', 'extraAttackerFix', 'yButtonFix', 'awarenessFix', 'oneTimerFix', 'shotFix', 'lockedChangeFix', 'lockedDefenceFix', 'openNetFix', 'secondAssist', 'regainAssist', 'postsFix'],
  },
  { id: 'statistics', title: 'Statistics', hacks: ['stickShots', 'bodychecks', 'bodychecksShown', 'timeOnIce', 'timeOnIceShown', 'giveaways', 'giveawaysShown', 'giveawayPages', 'blockedShots', 'blockedShotsShown', 'blockedShotPages', 'threeStars'] },
  { id: 'ratings', title: 'Ratings', hacks: ['clutchTime'] },
  {
    id: 'rules',
    title: 'Rules',
    hacks: [
      'seasonOvertime', 'seasonShootout', 'nhlShootout', 'shootoutInjuries', 'threeOnThree', 'fourthPeriodOvertime',
      'penaltyTime', 'realTime', 'thirtySecondPeriods', 'oneMinutePenalties', 'referees', 'noInterference', 'noPenaltyShots',
      'noIcing', 'creaseIcing', 'hybridIcing', 'noGoalPosts',
    ],
  },
  { id: 'fighting', title: 'Fighting', hacks: ['fighting', 'fightTime', 'fightMomentum', 'fightOnce'] },
  { id: 'energy', title: 'Energy and injury risk', hacks: ['noSkatingDrain', 'freeBurst', 'energySpeed', 'hitEnergy', 'holdEnergy', 'injuries', 'injuryBonus'] },
  { id: 'goalies', title: 'Goalies', hacks: ['goaliePoke', 'manualPullGoalie', 'goalieHold', 'diveHold', 'goalieWidth', 'goalieOut', 'goalieLine'] },
  { id: 'skating', title: 'Skating and the puck', hacks: ['speedBurst', 'turnRate', 'puckFriction', 'choppyIce'] },
  { id: 'lines', title: 'Edit Lines and controls', hacks: ['forwardsAndDefence', 'showMaxBoost', 'defenceControl'] },
  { id: 'looks', title: 'Looks and sound', hacks: ['skipEaIntro', 'skipPucksIntro', 'barrPick', 'barrCoin', 'organResume'] },
]
