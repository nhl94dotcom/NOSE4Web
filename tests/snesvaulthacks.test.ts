import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks, snesAnyPosition, withSnesHackChoice } from '../src/core/sneshacks'
import { pullGoalieText } from '../src/core/settings'
import { goalieCount } from '../src/core/team'

// The retail SNES ROM, without a copier header: NHL94SNESVault's offsets are
// the forum posts' for a headerless file.
const path = fileURLToPath(new URL('../../NHL94.smc', import.meta.url))
const hasRom = existsSync(path)
const open = () => openRom(new Uint8Array(readFileSync(path)))
const hex = (bytes: Uint8Array, at: number, count: number) => Array.from(bytes.subarray(at, at + count), (b) => b.toString(16).padStart(2, '0')).join('')

describe.skipIf(!hasRom)('NHL94SNESVault hacks for Edit Lines and the pads', () => {
  it('put in the bytes of McMarkis\'s posts, and come out again', () => {
    const project = open()
    expect(project.bytes.length).toBe(0x100000)
    const on = applySnesHacks(project, { extraAttackerFix: true, forwardsAndDefence: true, manualPullGoalie: true, showMaxBoost: true })
    // The extra attacker fix searches a fixed 6 places, from the extra attacker's down, on every line.
    expect(hex(on.bytes, 0xdce78, 13)).toBe('48a5a5186905008595a20600ea')
    // Any skater at any position: the hijack, and the new code after the extra attacker fix's.
    expect(hex(on.bytes, 0xd8e1a, 6)).toBe('eaeaea4cbace')
    expect(hex(on.bytes, 0xdceba, 33)).toBe('2200939b8da31d2200d39ea5a58dab1d22dc929b186da31d8da31dadab1d4c3b8e')
    // Pull the goalie with L and R: the hijack and 87 bytes of new code, which reads the press count at $1EF0.
    expect(hex(on.bytes, 0xf50bf, 5)).toBe('206efbeaea')
    expect(hex(on.bytes, 0xf7b6e, 5)).toBe('a20000ac91')
    expect(hex(on.bytes, 0xf7b6e + 32, 11)).toBe('bdf01ef0289ef01eeaeaea')
    expect(hex(on.bytes, 0xf7b6e + 83, 4)).toBe('01000200')
    expect(on.bytes[0xf7b6e + 87]).toBe(0xff)
    // And GetNewPresses's last store, STA $0AA2 at $9B:84D8, becomes a call to the code that counts the presses.
    expect(hex(on.bytes, 0xd84d8, 4)).toBe('20dbce60')
    expect(hex(on.bytes, 0xdcedb, 3)).toBe('8da20a')
    // While the game is paused, the counts are zeroed.
    expect(hex(on.bytes, 0xdcede, 13)).toBe('add8154a90079cf01e9cf21e60')
    expect(on.bytes[0xdcedb + 62]).toBe(0x60)
    expect(on.bytes[0xdcedb + 63]).toBe(0xff)
    // Max boost, testing the stored byte ($16).
    expect(hex(on.bytes, 0xf9a30, 3)).toBe('4c43fb')
    expect(hex(on.bytes, 0xffb43, 17)).toBe('a516c98000b0034cbd9aa964008da5006b')
    const state = detectSnesHacks(openRom(buildRom(on)).bytes)
    expect(state.unknown).toEqual([])
    expect([state.choices.forwardsAndDefence, state.choices.manualPullGoalie, state.choices.showMaxBoost]).toEqual([true, true, true])
    expect(applySnesHacks(on, detectSnesHacks(project.bytes).choices).bytes).toEqual(project.bytes)
  })

  it("recognise the Vault's own versions, and put in NOSE4Web's when asked", () => {
    const project = open()
    const bytes = project.bytes.slice()
    // The Vault's Max Boost and L and R, as its patches put them in.
    const put = (at: number, text: string) => bytes.set(Uint8Array.from(text.replace(/ /g, '').match(/../g)!.map((pair) => parseInt(pair, 16))), at)
    put(0xf9a30, '4C43FB')
    put(0xffb43, '2414 3003 4CBD9A A96400 8DA500 6B')
    put(0xf50bf, '206EFB EA EA')
    put(
      0xf7b6e,
      'A20000 AC9100 B9AA17 C900FF D001 60 B9C1FB DD841C F009 E8 E8 E00400 D0F1 802D BD7607 29FF00 C93000 D022 ' +
        'B9AA17 F007 C9FFFF F002 8016 49FFFF 99AA17 2207D49F A90070 8564 A90500 227DA180 A491 B9AA17 60 0100 0200',
    )
    // And the Vault's extra attacker fix, which NOSE4Web put in before 9 November 2026.
    put(0xd8c96, '2078CE')
    put(0xdce78, '48 A5A5 18 6D9F1D 8595 AE9F1D E8 A595 20728D CF8F1D9F F007 C695 CA D0F0 801E CA A5A5 18 6D9F1D ED8B1D 8595 20728D 48 A5A5 86AF 18 6DAF00 8595 68 207C8D 68 C90100 60')
    const vault = openRom(bytes)
    const state = detectSnesHacks(vault.bytes)
    expect(state.unknown).toEqual([])
    expect(state.vaultVersions).toEqual(['extraAttackerFix', 'showMaxBoost', 'manualPullGoalie'])
    expect([state.choices.extraAttackerFix, state.choices.showMaxBoost, state.choices.manualPullGoalie]).toEqual([true, true, true])
    // Left alone by an ordinary apply.
    expect(applySnesHacks(vault, { ...state.choices, noGoalPosts: true }).bytes.subarray(0xf7b6e, 0xf7b6e + 87)).toEqual(vault.bytes.subarray(0xf7b6e, 0xf7b6e + 87))
    // Updated when asked, and then NOSE4Web's own.
    const updated = applySnesHacks(vault, { extraAttackerFix: true, showMaxBoost: true, manualPullGoalie: true }, true)
    const fresh = applySnesHacks(project, { extraAttackerFix: true, showMaxBoost: true, manualPullGoalie: true })
    expect(updated.bytes).toEqual(fresh.bytes)
    expect(detectSnesHacks(updated.bytes).vaultVersions).toEqual([])
    // Taken out, the Vault's versions leave the original game.
    expect(applySnesHacks(vault, { extraAttackerFix: false, showMaxBoost: false, manualPullGoalie: false }).bytes).toEqual(project.bytes)
  })

  it("recognise NOSE4Web's L and R of the morning of 9 November 2026, which counted presses made in a pause", () => {
    const project = open()
    const on = applySnesHacks(project, { manualPullGoalie: true })
    const bytes = on.bytes.slice()
    bytes.fill(0xff, 0xdcedb, 0xdcedb + 63)
    bytes.set(Uint8Array.from('8da20aa20000bdb80a293000f013bd760729ff00c93000d008a918009df01e8009bdf01ef0043a9df01ee8e8e00400d0d560'.match(/../g)!.map((pair) => parseInt(pair, 16))), 0xdcedb)
    const earlier = openRom(bytes)
    expect(detectSnesHacks(earlier.bytes).vaultVersions).toEqual(['manualPullGoalie'])
    expect(applySnesHacks(earlier, { manualPullGoalie: true }, true).bytes).toEqual(on.bytes)
    expect(applySnesHacks(earlier, { manualPullGoalie: false }).bytes).toEqual(project.bytes)
  })

  it('go together as the Vault has them', () => {
    const { choices } = detectSnesHacks(open().bytes)
    expect(withSnesHackChoice(choices, 'forwardsAndDefence', true).extraAttackerFix).toBe(true)
    expect(withSnesHackChoice({ ...choices, forwardsAndDefence: true, extraAttackerFix: true }, 'extraAttackerFix', false).forwardsAndDefence).toBe(false)
    expect(withSnesHackChoice({ ...choices, hotColdFix: true }, 'showMaxBoost', true).hotColdFix).toBe(false)
    expect(withSnesHackChoice({ ...choices, showMaxBoost: true }, 'hotColdFix', true).showMaxBoost).toBe(false)
    expect(() => applySnesHacks(open(), { forwardsAndDefence: true })).toThrow(/needs the extra attacker fix/)
    expect(() => applySnesHacks(open(), { showMaxBoost: true, hotColdFix: true })).toThrow(/cannot both be on/)
  })

  it('let a forward play defence without a note, once Edit Lines allows it', () => {
    const project = open()
    const team = project.teams[1]
    const forward = goalieCount(team) + 1
    const lines = team.lines.map((line, l) => (l === 0 ? line.map((v, s) => (s === 1 ? forward : v)) : line))
    const moved = { ...project, teams: project.teams.map((t, i) => (i === 1 ? { ...team, lines } : t)) }
    const notes = (p: typeof project) => checkProject(p).filter((f) => f.team === 1 && /, a forward, at LD/.test(f.message))
    // The forward may be on the line already; then he is there twice too, which is still a problem.
    expect(notes(moved)).toHaveLength(1)
    const hacked = applySnesHacks(moved, { extraAttackerFix: true, forwardsAndDefence: true })
    expect(snesAnyPosition(hacked)).toBe(true)
    expect(notes(hacked)).toHaveLength(0)
  })
})

describe.skipIf(!hasRom)('when the computer pulls its goalie', () => {
  it('is read and written', () => {
    const project = open()
    expect(project.settings.cpuPullGoalie).toEqual({ goalsUnder: 3, secondsUnder: 61 })
    expect(pullGoalieText(project.settings.cpuPullGoalie!)).toBe('behind by 1 to 2 goals with 60 seconds or less left')
    const changed = { ...project, settings: { ...project.settings, cpuPullGoalie: { goalsUnder: 4, secondsUnder: 121 } } }
    const bytes = buildRom(changed)
    expect(openRom(bytes).settings.cpuPullGoalie).toEqual({ goalsUnder: 4, secondsUnder: 121 })
    // The two numbers only.
    expect(bytes.filter((b, i) => b !== project.bytes[i] && !(i >= 0x7fdc && i < 0x7fe0)).length).toBe(2)
    expect(pullGoalieText({ goalsUnder: 1, secondsUnder: 61 })).toBe('never')
  })
})

describe.skipIf(!hasRom)('the regained-puck assist fix', () => {
  it("calls code that clears the overwrite flag on a2touchpuck's same-player path, in place of its cmp and beq", () => {
    const project = open()
    expect(hex(project.bytes, 0xf4523, 5)).toBe('d99a17f03d')
    const on = applySnesHacks(project, { regainAssist: true })
    expect(on.bytes[0xf4523]).toBe(0x20)
    expect(hex(on.bytes, 0xf4526, 2)).toBe('eaea')
    const to = 0xf0000 + (on.bytes[0xf4524] | (on.bytes[0xf4525] << 8)) - 0x8000
    // cmp tmtouch1,y; beq +1; rts; pla; lda tmflags,y; and #$FFFB; sta tmflags,y; lda $A5; jmp $C565
    expect(hex(on.bytes, to, 21)).toBe('d99a17f0016068b9de1729fbff99de17a5a54c65c5')
    expect(detectSnesHacks(openRom(buildRom(on)).bytes).choices.regainAssist).toBe(true)
    expect(applySnesHacks(on, { regainAssist: false }).bytes).toEqual(project.bytes)
  })

  it.skipIf(!existsSync(fileURLToPath(new URL('../../nhl94_SA1_Original.sfc', import.meta.url))))('finds the same code in the SA-1 build, whose RAM is $6000 on', () => {
    const sa1 = openRom(new Uint8Array(readFileSync(fileURLToPath(new URL('../../nhl94_SA1_Original.sfc', import.meta.url)))))
    expect(detectSnesHacks(sa1.bytes).unknown).not.toContain('regainAssist')
    const on = applySnesHacks(sa1, { regainAssist: true })
    expect(detectSnesHacks(on.bytes).choices.regainAssist).toBe(true)
    expect(applySnesHacks(on, { regainAssist: false }).bytes).toEqual(sa1.bytes)
  })
})
