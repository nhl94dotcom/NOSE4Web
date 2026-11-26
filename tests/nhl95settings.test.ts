import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { applyNhl95Hacks, detectNhl95Hacks, NHL95_HACK_SECTIONS, NHL95_HACK_TITLES, NHL95_HACKS, NO_NHL95_HACKS, Nhl95HackError, nhl95GiveawaysOutdated, nhl95HackSheet, nhl95HacksForDiscord, nhl95HackStateChanges, nhl95WithHacksOf, type Nhl95HackChoices } from '../src/core/nhl95hacks'
import { attributeText } from '../src/core/attributes'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom } from '../src/core/rom'
import { websiteRosterRows, websiteRosterSupported } from '../src/core/websiteroster'
import { Nhl95HacksPage } from '../src/Nhl95HacksPage'
import { expectSameBytes } from './samebytes'

// NHL 94's settings at NHL '95's places. The expected bytes are the research's (port95: play95_sites, codes95,
// rules95_hex, nhl95_stats_hex), written out here, not taken from the source.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { nhl95Roms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const RETAIL = 'NHL95/NHL_95.bin'
const names = [RETAIL, ...(local.nhl95Roms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const clean = (text: string) => text.replace(/\s/g, '').toLowerCase()
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
const differing = (a: Uint8Array, b: Uint8Array) => a.reduce((n, byte, i) => n + (byte !== b[i] ? 1 : 0), 0)
// The code a hook of `length` bytes calls: a jsr, then NOPs.
function called(b: Uint8Array, at: number, length: number): number {
  expect(hex(b, at, 2)).toBe('4eb9')
  expect(hex(b, at + 6, length - 6)).toBe('4e71'.repeat((length - 6) / 2))
  return read32(b, at + 2)
}
const expectCode = (b: Uint8Array, at: number, length: number, code: string) => expect(hex(b, called(b, at, length), clean(code).length / 2)).toBe(clean(code))

// The code put in, as the research has it.
const HYBRID = '48E7 F880 08F8 0000 BB86 363C 00D7 0838 0001 BB86 6602 4443 307C AC62 0C38 0006 BB87 6D04 D0FC 0300 6146 3202 307C AC62 0C38 0006 BB87 6C04 D0FC 0300 6132 B441 6E22 4CDF 011F 2F0B 4240 1038 BB87 EF40 367C AC62 D6C0 303C 000C 4EB9 0008 9140 265F 4E75 08B8 0002 BB86 4CDF 011F 4E75 343C 7FFF 7805 4A68 0034 6F20 0828 0002 0063 6618 3028 0014 9043 4A43 6B02 4440 4A40 6A02 7000 B042 6C02 3400 D0FC 0080 51CC FFD4 4E75'
const SHOOTOUT_INJURIES = '4A38 F000 6756 0C78 0003 C020 664E 48E7 7040 43F8 F06A B1FC FFFF D194 6604 43E9 0366 7604 3400 3230 0000 D241 3231 1000 0C41 FFFC 670A 4A41 6F16 0801 000C 6710 5440 0C40 000A 6D02 7000 51CB FFDA 3002 31F0 0000 D00E 4CDF 020E 4E75 31F0 0000 D00E 4E75'
const FIGHT_300 = '0C10 0026 6706 0C10 0028 6608 0242 3000 0042 012C 3582 0068 0242 EFFF 4E75'
const OT4_5999 = '4A78 CC4C 661C 0838 0003 BF08 6708 0838 0005 D1A7 6610 0C78 0003 CC54 6608 303C 176F 5C97 4E75 4E75 4E34 0003'
const CHOPPY = '48E7 5400 7600 0C6B 000E 0052 6622 3238 C026 671C 3A01 9A78 C022 6F14 E545 0285 0000 FFFF 8AC1 3605 0C43 0004 6302 7604 302B 0028 6748 4A6B 0034 6616 0C6B 000E 0052 670E 4A42 670A 0C6B 22BA 0058 6702 5342 E460 6602 7001 4A43 671E 3200 6A02 4441 C2C3 7A00 1A2B 0003 0245 000F D245 E849 4A40 6A02 4441 D041 916B 0028 302B 002A 672C E460 6602 7001 4A43 671E 3200 6A02 4441 C2C3 7A00 1A2B 0003 0245 000F D245 E849 4A40 6A02 4441 D041 916B 002A 4CDF 002A 2EBC 0008 BC16 4E75'
const HIT_204 = '0838 0000 BEF0 6636 4A78 CC5C 6630 0838 0004 BF02 6628 4A6A 0034 6722 0C6B 000B 0052 6E1A 48E7 E0F0 264A 4EB9 0007 CAD0 0440 00CC 4EB9 0007 DBCA 4CDF 0F07 4A6B 0034 6606 2EBC 0007 B184 4E75'
const COUNTING_0 = '48E7 E0F0 0838 0000 BEF0 662C 4A6A 0034 6726 0C6B 000B 0052 6E1E 7200 122A 0066 082A 0006 0062 6704 0641 0020 41F8 F700 D0C1 5210 6402 5310 4CDF 0F07 4A6B 0034 6606 2EBC 0007 B184 4E75'
const COUNTING_204 = '48E7 E0F0 0838 0000 BEF0 664C 4A6A 0034 6746 0C6B 000B 0052 6E3E 7200 122A 0066 082A 0006 0062 6704 0641 0020 41F8 F700 D0C1 5210 6402 5310 4A78 CC5C 661A 0838 0004 BF02 6612 264A 4EB9 0007 CAD0 0440 00CC 4EB9 0007 DBCA 4CDF 0F07 4A6B 0034 6606 2EBC 0007 B184 4E75'
const HOLD_102 = '0838 0000 BEF0 6626 4A78 CC5C 6620 0838 0004 BF02 6618 48E7 E0F0 4EB9 0007 CAD0 0440 0066 4EB9 0007 DBCA 4CDF 0F07 323C 1F68 4EF9 0008 BC9A'
// The research's roll (bonus 5, cap 25) with the scaling to NHL '95's 0-399 roll before the add: mulu.w #5,d2 /
// addq.w #1,d2 / lsr.w #1,d2.
const rollCode = (bonus: string, cap: string) =>
  `48E7 6080 7200 122A 0066 082A 0006 0062 6704 0641 0020 41F8 F700 D0C1 7400 1410 C4FC ${bonus} 0C42 ${cap} 6304 343C ${cap} C4FC 0005 5242 E24A D46A 0032 B042 4CDF 0106 6E02 4E75 2EBC 0007 B4FA 4E75`
const GAME = '48E7 8080 41F8 F700 703F 4218 51C8 FFFC 4CDF 0101 4EF9 0000 AE48'
const PERIOD = '48E7 C080 41F8 F700 703F 1210 E209 10C1 51C8 FFF8 4CDF 0103 5278 C020 0878 0001 BEF0 4E75'
const CHECK_B = '5268 0010 4240 102B 0066 D0C0 5228 011E 0839 0000 00FF BEF0 6604 5228 0104 4E75'
const STARS_OFF = '324A 362A 000C 966B 000C 48C3 7819 4EB9 0007 CB4E 4440 D044 2883 4241 122A 00D0 C2FC 1B58 4242 142A 00EA B840 6200 0026 D394 C4FC 01F4 D594 4241 122A 00B6 C2FC 2AF8 D394 4241 122A 011E C2FC 01F4 D394 6000 003A BA69 0138 6200 0032 4A42 6700 002C E281 D394 4241 122A 00B6 4A41 6600 0008 0694 0000 3E80 C3FC D508 D394 4A43 6A00 0004 5382 C4FC 0384 D594 5449 524A 584C 51CC FF84 4E75 FFFF FFFF FFFF'
const STARS_ON = '324A 362A 000C 966B 000C 48C3 7819 4EB9 0007 CB4E 4440 D044 2883 4241 122A 00D0 C2FC 238C 4242 142A 00EA B840 6200 0026 D394 C4FC 028A D594 4241 122A 00B6 C2FC 37DC D394 4241 122A 011E C2FC 028A D394 6000 003A BA69 0138 6200 0032 4A42 6700 002C E281 D394 4241 122A 00B6 4A41 6600 0008 0694 0000 5140 C3FC D508 D394 4A43 6A00 0004 5382 C4FC 0492 D594 5449 524A 584C 51CC FF84 4E75 FFFF FFFF FFFF'
const TOI: [number, number, string][] = [
  [0x926f2, 12, '0C40 FFFF 6D14 4A47 6608 0C40 0005 6E0A 4E75 0C40 0004 6E02 4E75 588F 4EF9 0009 26E8'],
  [0x92826, 16, '43F9 0009 2B04 7001 D078 D276 0C78 0005 D276 6606 43FA 0028 7000 4EB9 0007 CB38 0C78 0004 D276 6614 4A47 6610 5378 AC40 43FA 0022 7000 4EB9 0007 CB38 4E75 0016 5B20 2020 2054 696D 6520 4F6E 2049 6365 2020 2020 0004 005D'],
  [0x927f4, 6, '0C78 0005 D276 6624 0C43 0003 6D1E 6618 31FC C000 AC44 2F09 43FA 0018 4EB9 0007 C6E6 225F D2D1 4E75 D2D1 4E75 4EF9 0007 C6E6 000A 2020 2020 2054 4F49'],
  [0x92a32, 6, '3400 302F 0004 2F57 0002 548F 0C41 0005 661A 3400 D442 0642 0138 3432 2000 0C42 176F 6304 343C 176F 588F 4E75 B042 4E75'],
  [0x92980, 8, '0C78 0005 D276 6632 0C45 0003 6D2C 4240 1014 7205 4EB9 0009 2A24 3002 4EB9 0007 D0BC 5678 AC40 31FC C000 AC44 4EB9 0007 C822 43FA 000E 7A04 4E75 7204 4EF9 0007 D154 0002'],
]
// The giveaways' code with the ROM's two tables (the same in all three ROMs), and the Player Stats pages. puckglue
// takes any cause below $FFFF as a pass (+$68); at +$1B8 the goalie's touch (bclr #2,(sflags4).w, then the carrier
// of a pass, $FFFE, forgotten), at +$1CE the pass at the net marked $FFFD toward the top's net, $FFFC toward the
// bottom's (released past the blue line, $56, 20 or more in front of the goal line, $10B, moving toward it, its line
// crossing it within 40 of the middle; then dopass's own two moves), at +$226 a2touchpuck's two moves and a goalie's
// touch of a pass at the net forgetting its passer (+$236, which checkgoal's calls too), at +$250 each frame's check
// that it has reached its goal line (then PuckIChk), at +$280 checkgoal's st (collflag).w, the forgetting and its cmpi.w;
// at +$28E (the entry at +0) and +$2AA (each frame) the carrier and the cause forgotten from the whistle to the end of
// the ref's sequence (gmpen), a pickup then not counted.
const GIVEAWAYS =
  '6000028C60000100600001106000013660000146600001686000016C60000114302A005231C0B3C248E7E0C008380004BEF06600008808380000BF00666C08380004BEF666643238EA006B5EEF4941F8AC62D0C114280062122A0062B3020802000667463238EA020C41FFFF67324A416B28EF4943F8AC62D2C14A690034672014290062102A0062B1020802000666101038EA057402612A60104A6A0034670A22481038EA047400611831EA0052EA0011EA0066EA0431FCFFFFEA024CDF03074E75024000FF0C400020643808290006006267040640002041F8EA104A42670441F8EA500C3000FF000067045230000041F8EB00082900060062670441F8EE66527020004E7531E80052BAD831EA0052EA0211EA0066EA054E7550F8B3C231EB0052EA0211EB0066EA0508380004BEF04E7550F8B3C2177C0010005E31FCFFFEEA024E7508F80004BEF431FCFFFFEA0031FCFFFFEA024E754278C02C4278C19621FCFFFFFFFFEA0041F8EA10701F429851C8FFFC42B8EB0042B8EE664E757C0F43FA013C4E753C3C000B43FA02344E753F00302A0052B078B3C2660C31EB0052EA0211EB0066EA05301F4EB90007C4F6588F4EF90007B42608B80002BEFA0C78FFFEEA02660631FCFFFFEA004E753238B38C3038B376082B000700626604444044410C4000566D344A416F300440010B44400C4000146D24C1F8B38A81C1691CD078B362064000280C400050620E70FD4A78B3766A02534031C0EA023038B38A3238B38C4E7531D2BB8231EA0014BB844A6A003466180C78FFFDEA0267080C78FFFCEA02660821FCFFFFFFFFEA004E750C78FFFDEA02660A0C78010BB3766C1260180C78FFFCEA0266100C78FEF5B3766E0821FCFFFFFFFFEA004EF900089ADA50F8BBA661B00C6B000D00244E7508380002BEF06700FD8A302A005231C0B3C221FCFFFFFFFFEA004E7508380002BEF0670821FCFFFFFFFFEA006000FF94000853636F726500000CFFFF000853686F7473000000FFFF000E53686F6F74696E6720506374FFFFFFFF000C506F77657220506C617900020004000C5050204D696E757465730354FFFF000A50502053686F74730356FFFF000A534820476F616C730358FFFF000C427265616B6177617973035C035A000C4F6E652D54696D6572730360035E001050656E616C74792053686F74730003640362000E466163656F66667320576F6E000EFFFF000E426F647920436865636B73000010FFFF000C50656E616C746965730000060008000E41747461636B205A6F6E6500000AFFFF000A50617373696E6700001400120010476976652F54616B6561776179732878287A000853636F726500000CFFFF000853686F7473000000FFFF000E53686F6F74696E6720506374FFFFFFFF000C427265616B6177617973035C035A000C4F6E652D54696D6572730360035E001050656E616C74792053686F74730003640362000E466163656F66667320576F6E000EFFFF000E426F647920436865636B73000010FFFF000C50656E616C746965730000060008000E41747461636B205A6F6E6500000AFFFF000A50617373696E6700001400120010476976652F54616B6561776179732878287A'
// NOSE4Web's later giveaways of 18 November 2026 (02b6053): without the two parts at the end (+$28E, +$2AA) that forget
// the carrier from the whistle to the end of the ref's sequence, so a pickup then counted.
const GIVEAWAYS_18B =
  '6000001E60000100600001106000013660000146600001686000016C60000114302A005231C0B3C248E7E0C008380004BEF06600008808380000BF00666C08380004BEF666643238EA006B5EEF4941F8AC62D0C114280062122A0062B3020802000667463238EA020C41FFFF67324A416B28EF4943F8AC62D2C14A690034672014290062102A0062B1020802000666101038EA057402612A60104A6A0034670A22481038EA047400611831EA0052EA0011EA0066EA0431FCFFFFEA024CDF03074E75024000FF0C400020643808290006006267040640002041F8EA104A42670441F8EA500C3000FF000067045230000041F8EB00082900060062670441F8EE66527020004E7531E80052BAD831EA0052EA0211EA0066EA054E7550F8B3C231EB0052EA0211EB0066EA0508380004BEF04E7550F8B3C2177C0010005E31FCFFFEEA024E7508F80004BEF431FCFFFFEA0031FCFFFFEA024E754278C02C4278C19621FCFFFFFFFFEA0041F8EA10701F429851C8FFFC42B8EB0042B8EE664E757C0F43FA010C4E753C3C000B43FA02044E753F00302A0052B078B3C2660C31EB0052EA0211EB0066EA05301F4EB90007C4F6588F4EF90007B42608B80002BEFA0C78FFFEEA02660631FCFFFFEA004E753238B38C3038B376082B000700626604444044410C4000566D344A416F300440010B44400C4000146D24C1F8B38A81C1691CD078B362064000280C400050620E70FD4A78B3766A02534031C0EA023038B38A3238B38C4E7531D2BB8231EA0014BB844A6A003466180C78FFFDEA0267080C78FFFCEA02660821FCFFFFFFFFEA004E750C78FFFDEA02660A0C78010BB3766C1260180C78FFFCEA0266100C78FEF5B3766E0821FCFFFFFFFFEA004EF900089ADA50F8BBA661B00C6B000D00244E75000853636F726500000CFFFF000853686F7473000000FFFF000E53686F6F74696E6720506374FFFFFFFF000C506F77657220506C617900020004000C5050204D696E757465730354FFFF000A50502053686F74730356FFFF000A534820476F616C730358FFFF000C427265616B6177617973035C035A000C4F6E652D54696D6572730360035E001050656E616C74792053686F74730003640362000E466163656F66667320576F6E000EFFFF000E426F647920436865636B73000010FFFF000C50656E616C746965730000060008000E41747461636B205A6F6E6500000AFFFF000A50617373696E6700001400120010476976652F54616B6561776179732878287A000853636F726500000CFFFF000853686F7473000000FFFF000E53686F6F74696E6720506374FFFFFFFF000C427265616B6177617973035C035A000C4F6E652D54696D6572730360035E001050656E616C74792053686F74730003640362000E466163656F66667320576F6E000EFFFF000E426F647920436865636B73000010FFFF000C50656E616C746965730000060008000E41747461636B205A6F6E6500000AFFFF000A50617373696E6700001400120010476976652F54616B6561776179732878287A'
// NOSE4Web's giveaways of 18 November 2026 (28d6450): one mark, $FFFD, for either net, forgotten at either goal line
// and in puckgoalie's hook, not a2touchpuck's or checkgoal's.
const GIVEAWAYS_18 =
  '6000001E60000100600001106000013660000146600001686000016C60000114302A005231C0B3C248E7E0C008380004BEF06600008808380000BF00666C08380004BEF666643238EA006B5EEF4941F8AC62D0C114280062122A0062B3020802000667463238EA020C41FFFF67324A416B28EF4943F8AC62D2C14A690034672014290062102A0062B1020802000666101038EA057402612A60104A6A0034670A22481038EA047400611831EA0052EA0011EA0066EA0431FCFFFFEA024CDF03074E75024000FF0C400020643808290006006267040640002041F8EA104A42670441F8EA500C3000FF000067045230000041F8EB00082900060062670441F8EE66527020004E7531E80052BAD831EA0052EA0211EA0066EA054E7550F8B3C231EB0052EA0211EB0066EA0508380004BEF04E7550F8B3C2177C0010005E31FCFFFEEA024E7508F80004BEF431FCFFFFEA0031FCFFFFEA024E754278C02C4278C19621FCFFFFFFFFEA0041F8EA10701F429851C8FFFC42B8EB0042B8EE664E757C0F43FA00CA4E753C3C000B43FA01C24E753F00302A0052B078B3C2660C31EB0052EA0211EB0066EA05301F4EB90007C4F6588F4EF90007B42608B80002BEFA0C78FFFEEA0267080C78FFFDEA02660631FCFFFFEA004E753238B38C3038B376082B000700626604444044410C4000566D2C4A416F280440010B44400C4000146D1CC1F8B38A81C16914D078B362064000280C400050620631FCFFFDEA023038B38A3238B38C4E750C78FFFDEA0266180C78010BB3766C080C78FEF5B3766E0821FCFFFFFFFFEA004EF900089ADA000853636F726500000CFFFF000853686F7473000000FFFF000E53686F6F74696E6720506374FFFFFFFF000C506F77657220506C617900020004000C5050204D696E757465730354FFFF000A50502053686F74730356FFFF000A534820476F616C730358FFFF000C427265616B6177617973035C035A000C4F6E652D54696D6572730360035E001050656E616C74792053686F74730003640362000E466163656F66667320576F6E000EFFFF000E426F647920436865636B73000010FFFF000C50656E616C746965730000060008000E41747461636B205A6F6E6500000AFFFF000A50617373696E6700001400120010476976652F54616B6561776179732878287A000853636F726500000CFFFF000853686F7473000000FFFF000E53686F6F74696E6720506374FFFFFFFF000C427265616B6177617973035C035A000C4F6E652D54696D6572730360035E001050656E616C74792053686F74730003640362000E466163656F66667320576F6E000EFFFF000E426F647920436865636B73000010FFFF000C50656E616C746965730000060008000E41747461636B205A6F6E6500000AFFFF000A50617373696E6700001400120010476976652F54616B6561776179732878287A'
// NOSE4Web's giveaways of 17 November 2026 (63b2559): without the goalie's touch and the pass at the net, and
// puckglue's test for $FFFE alone.
const GIVEAWAYS_17 =
  '6000001E60000100600001106000013660000146600001686000016C60000114302A005231C0B3C248E7E0C008380004BEF06600008808380000BF00666C08380004BEF666643238EA006B5EEF4941F8AC62D0C114280062122A0062B3020802000667463238EA020C41FFFE672C4A416B2EEF4943F8AC62D2C14A690034672014290062102A0062B1020802000666101038EA057402612A60104A6A0034670A22481038EA047400611831EA0052EA0011EA0066EA0431FCFFFFEA024CDF03074E75024000FF0C400020643808290006006267040640002041F8EA104A42670441F8EA500C3000FF000067045230000041F8EB00082900060062670441F8EE66527020004E7531E80052BAD831EA0052EA0211EA0066EA054E7550F8B3C231EB0052EA0211EB0066EA0508380004BEF04E7550F8B3C2177C0010005E31FCFFFEEA024E7508F80004BEF431FCFFFFEA0031FCFFFFEA024E754278C02C4278C19621FCFFFFFFFFEA0041F8EA10701F429851C8FFFC42B8EB0042B8EE664E757C0F43FA00364E753C3C000B43FA012E4E753F00302A0052B078B3C2660C31EB0052EA0211EB0066EA05301F4EB90007C4F6588F4EF90007B426000853636F726500000CFFFF000853686F7473000000FFFF000E53686F6F74696E6720506374FFFFFFFF000C506F77657220506C617900020004000C5050204D696E757465730354FFFF000A50502053686F74730356FFFF000A534820476F616C730358FFFF000C427265616B6177617973035C035A000C4F6E652D54696D6572730360035E001050656E616C74792053686F74730003640362000E466163656F66667320576F6E000EFFFF000E426F647920436865636B73000010FFFF000C50656E616C746965730000060008000E41747461636B205A6F6E6500000AFFFF000A50617373696E6700001400120010476976652F54616B6561776179732878287A000853636F726500000CFFFF000853686F7473000000FFFF000E53686F6F74696E6720506374FFFFFFFF000C427265616B6177617973035C035A000C4F6E652D54696D6572730360035E001050656E616C74792053686F74730003640362000E466163656F66667320576F6E000EFFFF000E426F647920436865636B73000010FFFF000C50656E616C746965730000060008000E41747461636B205A6F6E6500000AFFFF000A50617373696E6700001400120010476976652F54616B6561776179732878287A'
const GT_HOOKS: [number, number, number][] = [
  [0x7bab6, 8, 0],
  [0x7b9e6, 6, 4],
  [0x7c220, 6, 4],
  [0x7b446, 10, 8],
  [0x84be8, 6, 0xc],
  [0x9ca0, 8, 0x10],
  [0x922c2, 6, 0x14],
  [0x922d0, 8, 0x18],
  [0x84502, 10, 0x1c],
  [0x7b142, 8, 0x190],
  [0x7c1be, 6, 0x1b8],
  [0x846a0, 8, 0x1ce],
  [0x8129e, 6, 0x2aa],
  [0x8142c, 10, 0x226],
  [0x7bdd0, 10, 0x280],
]
const PAGES_TOI =
  '60000012600000306000006E600000D66000012A0C40FFFF6D144A4766080C4000076E0A4E750C4000046E024E75588F4EF9000926E83038D2760C4000056D0C43FA019A5B404EF90007CB3843F900092B0452404EB90007CB380C780004D27666144A4766105378AC4043FA015670004EF90007CB384E750C780005D2766D5E0C4300036D580C780007D27667322F0943FA01340C430004660443FA013031FC8000AC443038D2765540B043660631FCC000AC444EB90007C6E6225FD2D14E750C430003661431FCC000AC442F0943FA01024EB90007C6E6225FD2D14E754EF90007C6E63400302F00042F570002548F0C4100056D420C4100076722327CEA100C410006660443E90040B4FCC288670443E90020424214310000588F4E753400D44206420138343220000C42176F6304343C176F588F4E75B0424E750C780005D2766D740C4500036D6E0C780007D276673A42401014320554414EB900092A24300272044EB90007D15431FC8000AC4430055440B078D276660631FCC000AC444EB90007C82243FA00384E754240101472074EB900092A2430024EB90007D0BC5678AC4031FCC000AC444EB90007C82243FA000E7A044E7572044EF90007D15400020004005D00062020475600062020544B000A2020202020544F4900165B2020202047697665617761797320202020205D00165B2020202054616B65617761797320202020205D00165B2020202054696D65204F6E2049636520202020'
const PAGES =
  '60000012600000306000006E600000B0600000E40C40FFFF6D144A4766080C4000066E0A4E750C4000046E024E75588F4EF9000926E83038D2760C4000056D0C43FA01165B404EF90007CB3843F900092B0452404EB90007CB380C780004D27666144A4766105378AC4043FA00DC70004EF90007CB384E750C780005D2766D380C4300036D322F0943FA00C20C430004660443FA00BE31FC8000AC443038D2765540B043660631FCC000AC444EB90007C6E6225FD2D14E754EF90007C6E63400302F00042F570002548F0C4100056D22327CEA100C410006660443E90040B4FCC288670443E90020424214310000588F4E75B0424E750C780005D2766D400C4500036D3A42401014320554414EB900092A24300272044EB90007D15431FC8000AC4430055440B078D276660631FCC000AC444EB90007C82243FA000C4E7572044EF90007D15400020004005D00062020475600062020544B00165B2020202047697665617761797320202020205D00165B2020202054616B656177617973202020202020'

// Each in-place setting: what it is set to, and the bytes it leaves where.
const IN_PLACE: { name: string; set: Partial<Nhl95HackChoices>; bytes: [number, string][] }[] = [
  { name: 'unlimited stamina', set: { stamina: true }, bytes: [[0x7dbd2, '6002']] },
  { name: 'energy lost on the ice', set: { energyDrain: 50 }, bytes: [[0x8c1c2, '0032']] },
  { name: 'energy gained on the bench', set: { energyRecovery: 20 }, bytes: [[0x7db62, '0014']] },
  { name: 'skating costs no energy', set: { noSkatingDrain: true }, bytes: [[0x8c1a8, '6000']] },
  { name: "a burst's energy", set: { burstEnergy: 0 }, bytes: [[0xaa96, '0000']] },
  { name: 'goalie hold time', set: { goalieHold: 300 }, bytes: [[0x7bb46, '012c'], [0x830fa, '9f6b']] },
  { name: 'no goalie hold whistle', set: { goalieHold: 0 }, bytes: [[0x7bb46, '008c'], [0x830fa, '6002']] },
  { name: 'goalie hold after a dive catch', set: { diveHold: 30 }, bytes: [[0x7bb56, '001e']] },
  { name: 'goalie range to each side', set: { goalieWidth: 50 }, bytes: [[0x8b8ea, '0032'], [0x8b908, 'ffce']] },
  { name: 'goalie range up the ice', set: { goalieOut: 200 }, bytes: [[0x8b922, '00c8'], [0x8b92c, 'ff38']] },
  { name: 'goalie whistle line', set: { goalieLine: 150 }, bytes: [[0x8301e, '0096'], [0x83026, 'ff6a']] },
  {
    name: 'goalie control delay',
    set: { goalieDelay: 12 },
    bytes: [[0xa1e4, '0c0c'], [0xa1ea, '0c0c'], ...[0x83f07, 0x83f11, 0x84115, 0x8411f, 0x84143, 0x8416b].map((at): [number, string] => [at, '0c'])],
  },
  { name: 'speed burst', set: { speedBurst: 16 }, bytes: [[0xaaac, '7010']] },
  { name: 'stopping and turning', set: { turnRate: 200 }, bytes: [0x8bb28, 0x8bb36, 0x8bb50, 0x8bb5e].map((at): [number, string] => [at, '00c8']) },
  { name: "the puck's friction", set: { puckFriction: 8 }, bytes: [[0x8bbc8, '0008'], [0x8bbba, '7409']] },
  { name: 'real-time clock', set: { realTime: true }, bytes: [[0x7a384, '0444'], [0x89568, '003c'], [0x7a3cc, '0444']] },
  { name: 'penalty time', set: { penaltySeconds: 30 }, bytes: [[0x8942c, '001e']] },
  { name: 'no icing', set: { noIcing: true }, bytes: [[0x81538, '60040002bb86']] },
  { name: 'calls during a delayed penalty', set: { delayedCalls: true }, bytes: [[0x89a10, '6000001a'], [0x89a1e, '6000000c']] },
  { name: 'B-checks as with penalties on', set: { bCheckPenaltiesOff: 'asPenaltiesOn' }, bytes: [[0x7af3c, '60000030'], [0x7af46, '67000026']] },
  { name: "the forum's B-checks", set: { bCheckPenaltiesOff: 'forum' }, bytes: [[0x7af3c, '67000030'], [0x7af46, '66000026']] },
  { name: 'three stars, line changes off', set: { threeStars: 'linesOff' }, bytes: [[0x95c8a, clean(STARS_OFF)]] },
  { name: 'three stars, line changes on', set: { threeStars: 'linesOn' }, bytes: [[0x95c8a, clean(STARS_ON)]] },
  // Create_HotCold_Table's move.w #9,d0.
  { name: 'hot and cold range', set: { hotColdRange: 4 }, bytes: [[0x83e90, '303c0004']] },
  { name: 'no hot and cold', set: { hotColdRange: 0 }, bytes: [[0x83e90, '303c0000']] },
  // The roster screen's and Create Player's addi.w #140,d0.
  { name: 'base weight', set: { baseWeight: 144 }, bytes: [[0x8566a, '06400090'], [0x9944e, '06400090']] },
  { name: 'the lightest base weight', set: { baseWeight: 102 }, bytes: [[0x8566a, '06400066'], [0x9944e, '06400066']] },
]
// Clutch time: AttributeCalc's end becomes jmp / NOPs to its code, and the vblank's clock tick a jsr / NOPs.
const CLUTCH_CALC = '0243 00FF 0C78 000F BB12 672C 0C78 0002 C020 6624 0C78 0078 C022 621C 3038 C294 9078 C5FA 6A02 4440 0C40 0001 620A 5643 0C43 001E 6302 761E 4CDF 0207 4E75'
const CLUTCH_TICK =
  '5378 C022 0C78 0078 C022 664E 0C78 0002 C020 6646 0C78 0078 C022 623E 3038 C294 9078 C5FA 6A02 4440 0C40 0001 622C 41F8 AC62 720B 43FA 002C 7408 3019 1630 0000 5603 0C03 001E 6302 761E 1183 0000 51CA FFEA 41E8 0080 51C9 FFDC 0C78 003D C022 4E75 0068 0069 006C 006D 006E 0070 0071 0072 0075'
const INJURY_SITES = [0x7b48a, 0x9f078, 0x9f088, 0x9f0a0, 0x7b49c, 0x7b4c8]
const INJURIES: Record<string, string[]> = {
  original: ['6600006e', '66000022', '66000012', '67000018', '4eb90009f012', '31fc0004c016'],
  never: ['6000006e', '66000022', '66000012', '67000018', '4eb90009f012', '31fc0004c016'],
  penaltyOnly: ['6600006e', '66000022', '66000012', '67000018', '4e714e714e71', '4e714e714e71'],
  period: ['6600006e', '4e714e71', '4e714e71', '67000018', '4eb90009f012', '31fc0004c016'],
  game: ['6600006e', '66000022', '60000012', '60000018', '4eb90009f012', '31fc0004c016'],
  longFall: ['6600006e', '66000022', '66000012', '67000018', '6000005c4e71', '31fc0004c016'],
}
const FALL_LISTS = {
  original: '0303' + '00e3000600e4000600e50008037a0006037b0006037cfffa' + '00f7000600f8000600f90008037e0006037f00060380fffa',
  longFall: '0000' + '00e3000600e4000600e5000800e6012c00e700080041fff8' + '00f7000600f8000600f9000800fa012c00fb00080045fff8',
}

describe.skipIf(names.length === 0)("NHL 94's settings in NHL '95", () => {
  it.each(names)('reads %s as the original game but its injuries, which the WN95HL sets for the game', (name) => {
    const rom = open(name)
    const { choices, unknown } = detectNhl95Hacks(rom.bytes)
    expect(unknown).toEqual([])
    expect(choices).toEqual({ ...NO_NHL95_HACKS, injuries: name === RETAIL ? 'original' : 'game' })
    expect(INJURY_SITES.map((at, i) => hex(rom.bytes, at, INJURIES[choices.injuries][i].length / 2))).toEqual(INJURIES[choices.injuries])
  })

  it.each(names)('sets each in-place setting in %s at its places, reads it back, and sets it back', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    for (const { set, bytes } of IN_PLACE) {
      const on = applyNhl95Hacks(rom, set)
      for (const [at, value] of bytes) expect(hex(on.bytes, at, value.length / 2)).toBe(value)
      expect(differing(on.bytes, rom.bytes)).toBeLessThanOrEqual(bytes.reduce((n, [, value]) => n + value.length / 2, 0))
      expect(detectNhl95Hacks(on.bytes)).toEqual({ choices: { ...base, ...set }, unknown: [] })
      expect(detectNhl95Hacks(buildRom(on)).choices).toMatchObject(set)
      expectSameBytes(applyNhl95Hacks(on, { ...base }).bytes, rom.bytes)
    }
    // A forum ROM's no icing (bra.s +2, onto the bset's address word) is read as on, and set to NOSE4Web's.
    const forum = rom.bytes.slice()
    forum.set([0x60, 0x02], 0x81538)
    expect(detectNhl95Hacks(forum).choices.noIcing).toBe(true)
    expect(hex(applyNhl95Hacks({ ...rom, bytes: forum }, { noIcing: false }).bytes, 0x81538, 2)).toBe('08f8')
  })

  it.each(names)('sets the injuries six ways in %s, the long fall with its animation', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    for (const injuries of Object.keys(INJURIES) as Nhl95HackChoices['injuries'][]) {
      const on = applyNhl95Hacks(rom, { injuries })
      expect(INJURY_SITES.map((at, i) => hex(on.bytes, at, INJURIES[injuries][i].length / 2))).toEqual(INJURIES[injuries])
      expect(hex(on.bytes, 0x7e98, 50)).toBe(injuries === 'longFall' ? FALL_LISTS.longFall : FALL_LISTS.original)
      expect(detectNhl95Hacks(buildRom(on))).toEqual({ choices: { ...base, injuries }, unknown: [] })
      expectSameBytes(applyNhl95Hacks(on, { injuries: base.injuries }).bytes, rom.bytes)
    }
    // The long fall's code without its animation is not read as the long fall.
    const half = applyNhl95Hacks(rom, { injuries: 'longFall' }).bytes.slice()
    half.set(rom.bytes.subarray(0x7e98, 0x7e98 + 50), 0x7e98)
    expect(detectNhl95Hacks(half).unknown).toEqual(['injuries'])
  })

  it.each(names)('puts each hooked rule into %s, the code as the research has it, and takes it out', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const cases: { set: Partial<Nhl95HackChoices>; check: (b: Uint8Array) => void }[] = [
      { set: { hybridIcing: true }, check: (b) => expectCode(b, 0x89b32, 6, HYBRID) },
      { set: { shootoutInjuries: true }, check: (b) => expectCode(b, 0x9dd82, 6, SHOOTOUT_INJURIES) },
      { set: { fightSeconds: 300 }, check: (b) => expectCode(b, 0x89448, 8, FIGHT_300) },
      { set: { choppyIce: true }, check: (b) => expectCode(b, 0x8bbca, 76, CHOPPY) },
      {
        set: { fourthPeriodOvertime: 5999 },
        check: (b) => {
          expectCode(b, 0x7d4ae, 8, OT4_5999)
          // Per. Length's count, 3 to 4, in Game Setup's choices and Season Setup's.
          expect([b[0x85ead], b[0x8f786]]).toEqual([4, 4])
        },
      },
    ]
    for (const { set, check } of cases) {
      const on = applyNhl95Hacks(rom, set)
      check(on.bytes)
      expect(detectNhl95Hacks(on.bytes)).toEqual({ choices: { ...base, ...set }, unknown: [] })
      expect(detectNhl95Hacks(buildRom(on)).choices).toMatchObject(set)
      expectSameBytes(applyNhl95Hacks(on, { ...base }).bytes, rom.bytes)
    }
  })

  it.each(names)('puts clutch time into %s, the code as NHL 94 has it with NHL 95’s addresses, and takes it out', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    expect(hex(rom.bytes, 0x83d34, 10)).toBe(clean('0243 00FF 4CDF 0207 4E75'))
    expect(hex(rom.bytes, 0x7a392, 10)).toBe(clean('5378 C022 0C78 003D C022'))
    const on = applyNhl95Hacks(rom, { clutchTime: true })
    expect(hex(on.bytes, 0x83d34, 2)).toBe('4ef9')
    expect(hex(on.bytes, 0x83d3a, 4)).toBe('4e714e71')
    expect(hex(on.bytes, read32(on.bytes, 0x83d36), clean(CLUTCH_CALC).length / 2)).toBe(clean(CLUTCH_CALC))
    expectCode(on.bytes, 0x7a392, 10, CLUTCH_TICK)
    expect(detectNhl95Hacks(on.bytes)).toEqual({ choices: { ...base, clutchTime: true }, unknown: [] })
    expect(detectNhl95Hacks(buildRom(on)).choices.clutchTime).toBe(true)
    expectSameBytes(applyNhl95Hacks(on, { clutchTime: false }).bytes, rom.bytes)
    // One part without the other is not clutch time.
    const half = on.bytes.slice()
    half.set(rom.bytes.subarray(0x7a392, 0x7a392 + 10), 0x7a392)
    expect(detectNhl95Hacks(half).unknown).toEqual(['clutchTime'])
  })

  it.each(names)('sets the base weight in %s: the editor reads weights by it, and every player keeps their pounds', (name) => {
    const rom = open(name)
    const pounds = (project: typeof rom) =>
      project.teams.flatMap((team) => team.players.map((player) => Number(attributeText(project.game.playerAttributeKinds[0], player.attributes[0]))))
    const on = applyNhl95Hacks(rom, { baseWeight: 144 })
    expect(on.game.title).toBe(`${rom.game.title}, base weight 144`)
    expect(on.game.productCode).toBe(rom.game.productCode)
    expect(on.game.edition).toBe(95)
    expect([on.game.playerAttributeKinds[0], on.game.goalieAttributeKinds[0]]).toEqual(['weight:144', 'weight:144'])
    // Each weight moves to the step nearest their pounds: at most 4 pounds out, and the lightest no lighter than 144.
    const [was, now] = [pounds(rom), pounds(on)]
    now.forEach((weight, i) => expect(Math.abs(weight - Math.max(144, was[i]))).toBeLessThanOrEqual(4))
    // Saved and opened again: the same kind of ROM, the same weights; the website file has the steps, as for NHL 94.
    const reopened = openRom(buildRom(on))
    expect(reopened.game).toBe(on.game)
    expect(pounds(reopened)).toEqual(now)
    expect(websiteRosterSupported(on.game)).toBe(true)
    expect(websiteRosterRows(reopened).slice(1).map((row) => row[6])).toEqual(on.teams.flatMap((team) => team.players.map((player) => player.attributes[0])))
    // Back to 140: NHL '95 itself, the bytes as they were.
    const back = applyNhl95Hacks(on, { baseWeight: 140 })
    expect(back.game).toBe(rom.game)
    expectSameBytes(back.bytes, rom.bytes)
    // The ROM as opened is brought to the work's base weight to compare and reset against.
    expect(nhl95WithHacksOf(rom, on).game).toBe(on.game)
    expect(pounds(nhl95WithHacksOf(rom, on))).toEqual(now)
    expect(nhl95WithHacksOf(rom, applyNhl95Hacks(rom, { clutchTime: true }))).toBe(rom)
    // A project file carries it.
    const file = saveProjectFile(on, rom, 'P')
    const opened = openProjectFile(rom, JSON.stringify({ ...JSON.parse(file), rom: undefined }))
    expect(opened.project.game).toBe(on.game)
    expect(pounds(opened.project)).toEqual(now)
    // Only even weights from 102 to 152.
    expect(() => applyNhl95Hacks(rom, { baseWeight: 143 })).toThrow(Nhl95HackError)
    expect(() => applyNhl95Hacks(rom, { baseWeight: 154 })).toThrow(Nhl95HackError)
    // The two places must agree.
    const odd = applyNhl95Hacks(rom, { baseWeight: 144 }).bytes.slice()
    odd.set([0x00, 0x8c], 0x99450)
    expect(detectNhl95Hacks(odd).unknown).toEqual(['baseWeight'])
  })

  it.each(names)('takes energy for hits and holds in %s, and counts knockdowns for the injury risk', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const hit = applyNhl95Hacks(rom, { hitEnergy: 204, holdEnergy: 102 })
    expectCode(hit.bytes, 0x7b14a, 8, HIT_204)
    expectCode(hit.bytes, 0x7b02c, 10, HOLD_102)
    expect(detectNhl95Hacks(buildRom(hit)).choices).toEqual({ ...base, hitEnergy: 204, holdEnergy: 102 })
    expectSameBytes(applyNhl95Hacks(hit, { hitEnergy: 0, holdEnergy: 0 }).bytes, rom.bytes)
    // The risk alone: the knockdown hook only counts; the roll, each game's clearing and each intermission's halving.
    const risk = applyNhl95Hacks(rom, { injuryBonus: 5, injuryCap: 25 })
    expectCode(risk.bytes, 0x7b14a, 8, COUNTING_0)
    expectCode(risk.bytes, 0x7b47c, 8, rollCode('0005', '0019'))
    expectCode(risk.bytes, 0x9c34, 6, GAME)
    expectCode(risk.bytes, 0x8cb64, 10, PERIOD)
    expect(detectNhl95Hacks(buildRom(risk))).toEqual({ choices: { ...base, injuryBonus: 5, injuryCap: 25 }, unknown: [] })
    // Both: the knockdown hook counts and takes the energy.
    const both = applyNhl95Hacks(risk, { hitEnergy: 204 })
    expectCode(both.bytes, 0x7b14a, 8, COUNTING_204)
    expect(detectNhl95Hacks(both.bytes).choices).toMatchObject({ hitEnergy: 204, injuryBonus: 5, injuryCap: 25 })
    expect(detectNhl95Hacks(applyNhl95Hacks(both, { injuryBonus: 0 }).bytes).choices).toMatchObject({ hitEnergy: 204, injuryBonus: 0, injuryCap: 10 })
    expectCode(applyNhl95Hacks(both, { injuryBonus: 0 }).bytes, 0x7b14a, 8, HIT_204)
    expectSameBytes(applyNhl95Hacks(both, { hitEnergy: 0, injuryBonus: 0, injuryCap: 10 }).bytes, rom.bytes)
  })

  it.skipIf(!existsSync(path(RETAIL)))('scales the injury risk to NHL 95’s roll of 0 to 399, and reads NHL 94’s numbers back', () => {
    const rom = open(RETAIL)
    for (const [bonus, cap] of [[1, 1], [5, 25], [7, 33], [10, 60]]) {
      const on = applyNhl95Hacks(rom, { injuryBonus: bonus, injuryCap: cap })
      // NHL 94's numbers are what the code holds; the code multiplies by 2.5.
      expectCode(on.bytes, 0x7b47c, 8, rollCode(bonus.toString(16).padStart(4, '0'), cap.toString(16).padStart(4, '0')))
      expect(detectNhl95Hacks(on.bytes).choices).toMatchObject({ injuryBonus: bonus, injuryCap: cap })
    }
    // What the roll's code adds to the impact for a count of knockdowns, against NHL 94's chance: the same share of
    // its roll, bonus / 160 a knockdown, as bonus x 2.5 / 400, to the nearest whole impact.
    const added = (count: number, bonus: number, cap: number) => (Math.min(count * bonus, cap) * 5 + 1) >> 1
    expect([0, 1, 2, 5, 6].map((count) => added(count, 5, 25))).toEqual([0, 13, 25, 63, 63])
    for (const [count, bonus, cap] of [[1, 5, 25], [3, 7, 33], [10, 10, 60]]) {
      expect(Math.abs(added(count, bonus, cap) / 400 - Math.min(count * bonus, cap) / 160)).toBeLessThanOrEqual(0.5 / 400 + 1e-12)
    }
    // NHL 94's ranges.
    expect(() => applyNhl95Hacks(rom, { injuryBonus: 11 })).toThrow(Nhl95HackError)
    expect(() => applyNhl95Hacks(rom, { injuryBonus: 5, injuryCap: 61 })).toThrow(Nhl95HackError)
    expect(() => applyNhl95Hacks(rom, { energyDrain: 15 })).toThrow(Nhl95HackError)
    expect(() => applyNhl95Hacks(rom, { puckFriction: 2.5 })).toThrow(Nhl95HackError)
    expect(() => applyNhl95Hacks(rom, { injuries: 'sometimes' as Nhl95HackChoices['injuries'] })).toThrow(Nhl95HackError)
  })

  it.each(names)('counts bodychecks and shows time on ice in %s', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const checks = applyNhl95Hacks(rom, { bodychecks: 'on' })
    expectCode(checks.bytes, 0x7b164, 16, CHECK_B)
    expect(hex(checks.bytes, 0x8941e, 4)).toBe('4e714e71')
    expect(Buffer.from(checks.bytes.subarray(0x92b01, 0x92b04)).toString('latin1')).toBe('Chk')
    expect(Buffer.from(checks.bytes.subarray(0x92b76, 0x92b85)).toString('latin1')).toBe('   Checks For  ')
    expect(detectNhl95Hacks(buildRom(checks))).toEqual({ choices: { ...base, bodychecks: 'on' }, unknown: [] })
    expectSameBytes(applyNhl95Hacks(checks, { bodychecks: 'off' }).bytes, rom.bytes)
    const toi = applyNhl95Hacks(rom, { timeOnIce: true })
    for (const [at, length, code] of TOI) expectCode(toi.bytes, at, length, code)
    expect(detectNhl95Hacks(buildRom(toi))).toEqual({ choices: { ...base, timeOnIce: true }, unknown: [] })
    expectSameBytes(applyNhl95Hacks(toi, { timeOnIce: false }).bytes, rom.bytes)
  })

  it.each(names)('counts giveaways and takeaways in %s, with Player Stats pages with and without time on ice, either way round', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const pagesAt = (b: Uint8Array) => {
      const first = called(b, TOI[0][0], TOI[0][1])
      ;[0, 4, 8, 0xc, 0x10].forEach((entry, i) => expect(called(b, TOI[i][0], TOI[i][1])).toBe(first + entry))
      return first
    }
    const gt = applyNhl95Hacks(rom, { giveaways: true })
    const codeAt = called(gt.bytes, GT_HOOKS[0][0], GT_HOOKS[0][1])
    for (const [at, length, entry] of GT_HOOKS) expect(called(gt.bytes, at, length)).toBe(codeAt + entry)
    expect(hex(gt.bytes, codeAt, clean(GIVEAWAYS).length / 2)).toBe(clean(GIVEAWAYS))
    expect([hex(gt.bytes, 0x92120, 2), hex(gt.bytes, 0x9212e, 2)]).toEqual(['0080', '0040'])
    expect(hex(gt.bytes, pagesAt(gt.bytes), clean(PAGES).length / 2)).toBe(clean(PAGES))
    expect(detectNhl95Hacks(buildRom(gt))).toEqual({ choices: { ...base, giveaways: true }, unknown: [] })
    expectSameBytes(applyNhl95Hacks(gt, { giveaways: false }).bytes, rom.bytes)
    // With time on ice, put in after them or before them: the pages with it, the same either way.
    const later = applyNhl95Hacks(gt, { timeOnIce: true })
    const sooner = applyNhl95Hacks(applyNhl95Hacks(rom, { timeOnIce: true }), { giveaways: true })
    const together = applyNhl95Hacks(rom, { giveaways: true, timeOnIce: true })
    for (const both of [later, sooner, together]) {
      expect(hex(both.bytes, pagesAt(both.bytes), clean(PAGES_TOI).length / 2)).toBe(clean(PAGES_TOI))
      expect(detectNhl95Hacks(buildRom(both))).toEqual({ choices: { ...base, giveaways: true, timeOnIce: true }, unknown: [] })
      expectSameBytes(both.bytes, together.bytes)
    }
    // Either out: the other as it is alone.
    expectSameBytes(applyNhl95Hacks(together, { timeOnIce: false }).bytes, gt.bytes)
    expectSameBytes(applyNhl95Hacks(together, { giveaways: false }).bytes, applyNhl95Hacks(rom, { timeOnIce: true }).bytes)
    expectSameBytes(applyNhl95Hacks(together, { giveaways: false, timeOnIce: false }).bytes, rom.bytes)
  })

  it.each(names)('knows the giveaways of 17 and 18 November in %s, which counted a pass shot or a pickup after the whistle differently, and puts in the current ones', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    // The places the earlier versions have no hook at (all five for 17 November's, the last two for 18 November's), as
    // the game has them, in all three ROMs.
    const PLACES: [number, string][] = [
      [0x7c1be, '08b80002befa'],
      [0x846a0, '3038b38a3238b38c'],
      [0x8129e, '4eb900089ada'],
      [0x8142c, '31d2bb8231ea0014bb84'],
      [0x7bdd0, '50f8bba60c6b000d0024'],
    ]
    const places = (b: Uint8Array) => PLACES.map(([at, bytes]) => hex(b, at, bytes.length / 2))
    expect(places(rom.bytes)).toEqual(PLACES.map(([, bytes]) => bytes))
    // No other option changes them.
    const left = ['fightingOff', 'fightingArcade', 'seasonOvertime', 'seasonShootoutNow', 'threeOnThreeAll', 'giveaways']
    const others = applyNhl95Hacks(rom, Object.fromEntries(NHL95_HACKS.filter((hack) => typeof NO_NHL95_HACKS[hack] === 'boolean').map((hack) => [hack, !left.includes(hack)])))
    expect(places(others.bytes)).toEqual(PLACES.map(([, bytes]) => bytes))
    const gt = applyNhl95Hacks(rom, { giveaways: true })
    expect(nhl95GiveawaysOutdated(gt.bytes)).toBe(false)
    expect(nhl95GiveawaysOutdated(rom.bytes)).toBe(false)
    const page = (project: typeof rom) => renderToStaticMarkup(createElement(Nhl95HacksPage, { project, name: 'L', onChange: () => {} }))
    expect(page(gt)).not.toContain('Put in the current version')
    const codeAt = called(gt.bytes, GT_HOOKS[0][0], GT_HOOKS[0][1])
    // Each: its code and tables where the current ones are, its own hooks at its own entries, the rest not hooked.
    const versions: [string, [number, number][]][] = [
      [GIVEAWAYS_17, []],
      [GIVEAWAYS_18, [[0x7c1be, 0x1b8], [0x846a0, 0x1d6], [0x8129e, 0x226]]],
      [GIVEAWAYS_18B, [[0x7c1be, 0x1b8], [0x846a0, 0x1ce], [0x8129e, 0x250], [0x8142c, 0x226], [0x7bdd0, 0x280]]],
    ]
    for (const [code, hooks] of versions) {
      const bytes = gt.bytes.slice()
      bytes.fill(0xff, codeAt, codeAt + clean(GIVEAWAYS).length / 2)
      bytes.set(Buffer.from(code, 'hex'), codeAt)
      for (const [at, original] of PLACES) bytes.set(Buffer.from(original, 'hex'), at)
      for (const [at, entry] of hooks) {
        bytes.set([0x4e, 0xb9], at)
        new DataView(bytes.buffer).setUint32(at + 2, codeAt + entry)
        const length = PLACES.find(([place]) => place === at)![1].length / 2
        for (let o = 6; o < length; o += 2) bytes.set([0x4e, 0x71], at + o)
      }
      const earlier = { ...rom, bytes }
      expect(nhl95GiveawaysOutdated(bytes)).toBe(true)
      expect(detectNhl95Hacks(bytes)).toEqual({ choices: { ...base, giveaways: true }, unknown: [] })
      // Put in again as the current version (the page's button applies the ROM's own choices), or taken out.
      const again = applyNhl95Hacks(earlier, detectNhl95Hacks(bytes).choices)
      expectSameBytes(again.bytes, gt.bytes)
      expectSameBytes(applyNhl95Hacks(earlier, { giveaways: true }).bytes, gt.bytes)
      expectSameBytes(applyNhl95Hacks(earlier, { giveaways: false }).bytes, rom.bytes)
      // With time on ice too.
      expectSameBytes(applyNhl95Hacks(earlier, { timeOnIce: true }).bytes, applyNhl95Hacks(rom, { giveaways: true, timeOnIce: true }).bytes)
      // The page says so, with the button.
      expect(page(earlier)).toContain('This ROM has an earlier version of it.')
      expect(page(earlier)).toContain('Put in the current version')
    }
  })

  it.each(names)("keeps the extra period length's count in the fighting patch's copy of Game Setup's in %s, either way round", (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const FIGHT_COUNT = 0x1e0e73
    const fight = applyNhl95Hacks(rom, { fighting: true })
    expect(fight.bytes[FIGHT_COUNT]).toBe(3)
    const ot = applyNhl95Hacks(rom, { fourthPeriodOvertime: 600 })
    for (const both of [applyNhl95Hacks(fight, { fourthPeriodOvertime: 600 }), applyNhl95Hacks(ot, { fighting: true }), applyNhl95Hacks(rom, { fighting: true, fourthPeriodOvertime: 600 })]) {
      expect([both.bytes[0x85ead], both.bytes[0x8f786], both.bytes[FIGHT_COUNT]]).toEqual([4, 4, 4])
      expect(detectNhl95Hacks(buildRom(both))).toEqual({ choices: { ...base, fighting: true, fourthPeriodOvertime: 600 }, unknown: [] })
      // Fighting out: the extra length stays, with its counts; the length out: fighting's copy back to 3.
      const noFight = applyNhl95Hacks(both, { fighting: false })
      expectSameBytes(noFight.bytes, ot.bytes)
      const noOt = applyNhl95Hacks(both, { fourthPeriodOvertime: 0 })
      expectSameBytes(noOt.bytes, fight.bytes)
      expectSameBytes(applyNhl95Hacks(both, { fighting: false, fourthPeriodOvertime: 0 }).bytes, rom.bytes)
    }
  })

  it.each(names)('puts every setting into %s at once with every other NHL 95 option, each read back and each out on its own', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const left = ['fightingOff', 'fightingArcade', 'seasonOvertime', 'seasonShootoutNow', 'threeOnThreeAll']
    const switches = Object.fromEntries(NHL95_HACKS.filter((hack) => typeof NO_NHL95_HACKS[hack] === 'boolean').map((hack) => [hack, !left.includes(hack)]))
    const settings: Partial<Nhl95HackChoices> = {
      threeStars: 'linesOn',
      bodychecks: 'on',
      penaltySeconds: 45,
      fightSeconds: 120,
      bCheckPenaltiesOff: 'asPenaltiesOn',
      injuries: 'period',
      fourthPeriodOvertime: 5940,
      energyDrain: 40,
      energyRecovery: 12,
      burstEnergy: 100,
      hitEnergy: 1365,
      holdEnergy: 683,
      injuryBonus: 5,
      injuryCap: 25,
      goalieHold: 200,
      diveHold: 45,
      goalieWidth: 40,
      goalieOut: 220,
      goalieLine: 160,
      goalieDelay: 12,
      speedBurst: 20,
      turnRate: 170,
      puckFriction: 8,
      baseWeight: 152,
      hotColdRange: 4,
      referees: 'lenient',
    }
    // Every option is in one list or the other: a new one fails here until it is added.
    expect([...Object.keys(switches), ...Object.keys(settings)].sort()).toEqual([...NHL95_HACKS].sort())
    for (const hack of Object.keys(settings) as (keyof Nhl95HackChoices)[]) expect(settings[hack], hack).not.toBe(NO_NHL95_HACKS[hack])
    const all: Nhl95HackChoices = { ...base, ...switches, ...settings }
    const on = applyNhl95Hacks(rom, all)
    expect(detectNhl95Hacks(on.bytes)).toEqual({ choices: all, unknown: [] })
    expect(detectNhl95Hacks(buildRom(on))).toEqual({ choices: all, unknown: [] })
    // Each setting back to the original's on its own, the rest kept.
    for (const hack of Object.keys(settings) as (keyof Nhl95HackChoices)[]) {
      if (hack === 'injuryCap') continue
      const without = applyNhl95Hacks(on, { [hack]: base[hack] })
      expect(detectNhl95Hacks(without.bytes)).toEqual({ choices: { ...all, [hack]: base[hack], ...(hack === 'injuryBonus' ? { injuryCap: NO_NHL95_HACKS.injuryCap } : {}) }, unknown: [] })
    }
    expectSameBytes(applyNhl95Hacks(on, base).bytes, rom.bytes)
  })

  it.each(names)("shows every option of %s once on the Hacks page, in its section, each setting's note ending as tested", (name) => {
    const rom = open(name)
    expect(NHL95_HACK_SECTIONS.flatMap((section) => section.hacks).sort()).toEqual([...NHL95_HACKS].sort())
    const html = renderToStaticMarkup(createElement(Nhl95HacksPage, { project: rom, name: 'L', onChange: () => {} }))
    const sections = [...html.matchAll(/<section id="hacks-([a-z]+)"[^>]*>(.*?)<\/section>/gs)].map((m) => ({ id: m[1], html: m[2] }))
    expect(sections.map((s) => s.id)).toEqual([...NHL95_HACK_SECTIONS.map((s) => s.id), 'apply'])
    const TESTED = 'The same option as in NHL 94; it works on the WN95HL&#x27;s ROMs too. Tested in the game by the NHL94 Match Viewer project.'
    const UNTESTED = 'The same option as in NHL 94; it works on the WN95HL&#x27;s ROMs too. Not yet tested in the game.'
    const notYet: string[] = []
    for (const section of NHL95_HACK_SECTIONS) {
      const shown = sections.find((s) => s.id === section.id)!.html
      for (const hack of section.hacks.filter((hack) => hack !== 'fightingArcade' && hack !== 'fightingOff')) {
        const at = shown.indexOf(`<b>${NHL95_HACK_TITLES[hack].replace(/'/g, '&#x27;')}</b>`)
        expect(at, hack).toBeGreaterThanOrEqual(0)
        // NHL 94's settings: their note ends with the line for them.
        if (NHL95_HACKS.indexOf(hack) >= NHL95_HACKS.indexOf('threeStars')) expect(shown.slice(at).split('</details>')[0], hack).toContain(notYet.includes(hack) ? UNTESTED : TESTED)
      }
    }
    expect(html).not.toContain('undefined')
    // The WN95HL's injuries for the game, as the ROM has them.
    expect(html).toMatch(name === RETAIL ? /<option value="original" selected="">As in the original game/ : /<option value="game" selected="">Every injury for the game/)
    // NHL '95's own numbers in the boxes.
    expect(html).toContain('aria-label="Puck friction" aria-invalid="false" value="7"')
    expect(html).toContain('aria-label="Goalie hold time" aria-invalid="false" value="2.33"')
  })

  it.skipIf(!existsSync(path(RETAIL)))('offers the most knockdowns can add only with a risk from them, as nothing of it is written without one', () => {
    const rom = open(RETAIL)
    const page = (project: typeof rom) => renderToStaticMarkup(createElement(Nhl95HacksPage, { project, name: 'L', onChange: () => {} }))
    const box = (html: string) => html.match(/<input[^>]*aria-label="Most injury risk knockdowns can add"[^>]*>/)![0]
    expect(box(page(rom))).toContain('disabled=""')
    expect(page(rom)).toContain('Set the risk above first.')
    const risk = page(applyNhl95Hacks(rom, { injuryBonus: 5, injuryCap: 25 }))
    expect(box(risk)).not.toContain('disabled')
    expect(risk).not.toContain('Set the risk above first.')
  })

  it.skipIf(!existsSync(path(RETAIL)))('lists the settings as they change, in a Discord post and in the hack sheet', () => {
    const rom = open(RETAIL)
    const on = applyNhl95Hacks(rom, { penaltySeconds: 30, injuries: 'never', puckFriction: 8, bodychecks: 'on', speedBurst: 16, injuryBonus: 5, injuryCap: 25 })
    const now = detectNhl95Hacks(on.bytes)
    expect(nhl95HackStateChanges(detectNhl95Hacks(rom.bytes), now)).toEqual([
      'Bodycheck statistics: off to on.',
      'Penalty time: minors 2:00 and majors 5:00 (as the original game) to minors 1:00 and majors 2:30.',
      'Injuries: as in the original game to never: a hit is only a fall.',
      'Injury risk added by each knockdown: 0 to 5.',
      'Most injury risk knockdowns can add: 10 to 25.',
      "Speed burst: the original game's to 16.",
      'Puck friction: 7 to 8.',
    ])
    const post = nhl95HacksForDiscord(on.bytes, 'L')
    expect(post).toContain('- **Bodycheck statistics**')
    expect(post).toContain('- **Puck friction**: 8 (the original game has 7)')
    expect(post).toContain('- **Injuries**: never: a hit is only a fall')
    const sheet = nhl95HackSheet(on.bytes, 'L')
    expect(sheet.sections.map((s) => s.heading)).toEqual(['Statistics', 'Rules', 'Energy and injury risk', 'Skating and the puck'])
    // Injuries comes first in Energy and injury risk, then the risk each knockdown adds.
    expect(sheet.sections.find((s) => s.heading === 'Energy and injury risk')!.items[1].text).toContain('about 3 in 100 more likely')
  })
})

