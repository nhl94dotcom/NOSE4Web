import type { HackChoices } from './hacks'
import type { SnesHack } from './sneshacks'

// How the Hacks pages and the hack sheets group the hacks: the same sections,
// in the same order, on both systems, so that a hack is found in the same
// place on the page as on the sheet a league posts. The Genesis page is
// written out by hand in this order (a test checks it); the SNES page and
// both sheets are built from these lists.
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
      'faceoffFix', 'runawayFix', 'penaltyShotTableFix', 'penaltyShotFixes', 'snipingFix', 'goaliePullFix', 'blindRingFix', 'awarenessFix', 'crowdFix',
    ],
  },
  { id: 'statistics', title: 'Statistics', hacks: ['stickShots', 'bodychecks', 'plusMinus', 'threeStars'] },
  { id: 'ratings', title: 'Ratings', hacks: ['wideRatings', 'baseWeight', 'bonuses', 'hotColdRange'] },
  { id: 'rules', title: 'Rules', hacks: ['seasonTies', 'fourthPeriodOvertime', 'fighting', 'penaltySeconds', 'realTime', 'noIcing', 'hybridIcing', 'threeOnThree', 'delayedCalls', 'bCheckPenaltiesOff', 'injuries'] },
  {
    id: 'energy',
    title: 'Energy and injury risk',
    hacks: ['stamina', 'energyDrain', 'energyRecovery', 'noSkatingDrain', 'burstEnergy', 'hitEnergy', 'holdEnergy', 'injuryBonus', 'injuryCap'],
  },
  { id: 'goalies', title: 'Goalies', hacks: ['goalieHold', 'goalieWidth', 'goalieOut', 'goalieLine', 'goalieDelay'] },
  { id: 'skating', title: 'Skating and the puck', hacks: ['speedBurst', 'turnRate', 'puckFriction'] },
  { id: 'lines', title: 'Edit Lines and controls', hacks: ['fewerSkaterLines', 'anyPosition'] },
  { id: 'looks', title: 'Looks and screens', hacks: ['puckColours', 'netColours', 'greenFan', 'introWait', 'headBleeding'] },
  { id: 'legacy', title: 'Legacy hacks', hacks: ['weightFix'] },
]

export const SNES_HACK_GROUPS: HackGroup<SnesHack>[] = [
  {
    id: 'fixes',
    title: 'Fixes',
    hacks: ['hotColdFix', 'ppPkFix', 'comebackFix', 'faceoffFix', 'penaltyShotFixes', 'extraAttackerFix', 'yButtonFix', 'awarenessFix', 'secondAssist', 'regainAssist'],
  },
  { id: 'statistics', title: 'Statistics', hacks: ['stickShots', 'bodychecks', 'bodychecksShown'] },
  { id: 'rules', title: 'Rules', hacks: ['fighting', 'oneMinutePenalties', 'penaltyTime', 'thirtySecondPeriods', 'fourthPeriodOvertime', 'seasonOvertime', 'seasonShootout', 'threeOnThree', 'noInterference', 'noPenaltyShots', 'noGoalPosts'] },
  { id: 'energy', title: 'Energy and injury risk', hacks: ['noSkatingDrain', 'freeBurst', 'energySpeed', 'hitEnergy', 'holdEnergy', 'injuries', 'injuryBonus'] },
  { id: 'goalies', title: 'Goalies', hacks: ['goaliePoke'] },
  { id: 'lines', title: 'Edit Lines and controls', hacks: ['forwardsAndDefence', 'showMaxBoost', 'manualPullGoalie', 'defenceControl'] },
  { id: 'looks', title: 'Looks and screens', hacks: ['skipEaIntro', 'skipPucksIntro'] },
]
