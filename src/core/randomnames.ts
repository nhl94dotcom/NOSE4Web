// Made-up player names, a first name and a last name, for players made up on a team's page (archetypes.ts). The
// names are of the kinds found on hockey rosters, from Canada, the United States, Sweden, Finland, the Czech and
// Slovak lands and Russia, spelt in plain letters (the games' fonts have no accents), with no apostrophes or
// hyphens, and kept short, since every letter takes room in the ROM.

const FIRST = [
  'Adam', 'Alex', 'Andre', 'Andy', 'Anton', 'Ben', 'Blake', 'Brad', 'Brendan', 'Brent', 'Brett', 'Brian', 'Bruce',
  'Cal', 'Carl', 'Chris', 'Claude', 'Cody', 'Colin', 'Craig', 'Curtis', 'Dale', 'Dan', 'Darcy', 'Darren', 'Dave',
  'Denis', 'Derek', 'Don', 'Doug', 'Dustin', 'Dylan', 'Eric', 'Erik', 'Evan', 'Felix', 'Frank', 'Gary', 'Glen',
  'Greg', 'Guy', 'Hank', 'Ivan', 'Jack', 'Jake', 'Jamie', 'Jan', 'Jari', 'Jason', 'Jeff', 'Jim', 'Joe', 'Joel',
  'Jon', 'Josh', 'Juha', 'Kevin', 'Kirk', 'Kyle', 'Lars', 'Leo', 'Luc', 'Luke', 'Marc', 'Mark', 'Martin', 'Matt',
  'Max', 'Mats', 'Mike', 'Mikko', 'Nick', 'Niklas', 'Olli', 'Owen', 'Pat', 'Paul', 'Pavel', 'Peter', 'Petr', 'Phil',
  'Pierre', 'Ray', 'Rick', 'Rob', 'Roman', 'Ron', 'Ryan', 'Sami', 'Scott', 'Sean', 'Sergei', 'Shane', 'Stan',
  'Steve', 'Sven', 'Ted', 'Teemu', 'Terry', 'Tim', 'Todd', 'Tom', 'Tomas', 'Tony', 'Travis', 'Trevor', 'Troy',
  'Ville', 'Vlad', 'Wade', 'Wes', 'Yves', 'Zach',
]

const LAST = [
  'Abbott', 'Allard', 'Andersson', 'Archer', 'Bailey', 'Barnes', 'Beaulieu', 'Gauthier', 'Berg', 'Blake', 'Bodnar',
  'Boucher', 'Boyle', 'Brennan', 'Brooks', 'Burke', 'Campbell', 'Carlsson', 'Carter', 'Chapman', 'Cloutier',
  'Cole', 'Connolly', 'Cooper', 'Cote', 'Cullen', 'Dahl', 'Dawson', 'Demers', 'Doyle', 'Barton', 'Dube', 'Dufour',
  'Duncan', 'Dvorak', 'Eklund', 'Ellis', 'Erikson', 'Fisher', 'Hamel', 'Flynn', 'Foster', 'Fraser', 'Gagnon',
  'Garner', 'Gibson', 'Girard', 'Graham', 'Grant', 'Gustafsson', 'Hagen', 'Hall', 'Hanson', 'Harper', 'Hayes',
  'Nordin', 'Holm', 'Horak', 'Howard', 'Hughes', 'Hunt', 'Jansson', 'Jensen', 'Johansson', 'Kane', 'Keller',
  'Kelly', 'Kerr', 'Mattila', 'Kovac', 'Rowe', 'Kruger', 'Kucera', 'Lacroix', 'Lambert', 'Landry', 'Larsen',
  'Holt', 'Leblanc', 'Leclair', 'Lindgren', 'Lund', 'Lynch', 'MacKay', 'Madden', 'Malone', 'Marsh', 'Martel',
  'Mason', 'McKenzie', 'Miller', 'Moore', 'Morin', 'Morrow', 'Murphy', 'Murray', 'Nash', 'Nielsen', 'Nolan',
  'Novak', 'Nyberg', 'Olsen', 'Orlov', 'Ouellet', 'Parker', 'Pelletier', 'Perron', 'Peterson', 'Petrov', 'Pike',
  'Poirier', 'Powell', 'Quinn', 'Reid', 'Reilly', 'Jokela', 'Roberts', 'Rousseau', 'Roy', 'Ryan', 'Salo', 'Sauve',
  'Ferris', 'Scott', 'Ahola', 'Shaw', 'Simard', 'Sinclair', 'Smith', 'Sokol', 'Stone', 'Strand', 'Sutton',
  'Svoboda', 'Taylor', 'Thibault', 'Thompson', 'Tremblay', 'Turner', 'Vachon', 'Kowalski', 'Virta', 'Volkov',
  'Wagner', 'Walker', 'Wallin', 'Ward', 'Watson', 'Webb', 'Wilson', 'Wright', 'Young', 'Sandberg', 'Sokolov',
]

// A name not in `taken`, which it is added to. `random` gives a number from 0 to 1, as Math.random does.
export function randomName(taken: Set<string>, random: () => number = Math.random): string {
  const pick = (list: string[]) => list[Math.min(list.length - 1, Math.floor(random() * list.length))]
  let name = `${pick(FIRST)} ${pick(LAST)}`
  // A few hundred tries is plenty against a roster, or a league, of names.
  for (let tries = 0; taken.has(name) && tries < 300; tries++) name = `${pick(FIRST)} ${pick(LAST)}`
  taken.add(name)
  return name
}

export const NAME_COUNT = FIRST.length * LAST.length
export const NAME_PARTS = { first: FIRST, last: LAST }
