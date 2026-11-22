// NOSE4Web's touch-ups in the style of Clockwise's sprite edit (clockwise.ts),
// worked out by the NHL94 Match Viewer project with Clockwise's own rule: tape
// is colours 13 and 14 becoming 2 at the blade's end; an eye is a grey face
// pixel with five or more skin-coloured neighbours becoming 2. In a module of
// their own, since both clockwise.ts and fight.ts read them.
//
// Each: where it starts, the bytes there before and after, in hex (two pixels a byte).

export type Tape = [at: number, original: string, patched: string]

// chaos's fighting patch's fight frames 846-869 (tiles 8261-8487), at the
// offsets the patch writes them to in the first MB (fight.ts): the sticks taped
// in the glove drops and punches, and the eye of the overhand punch. 38 bytes.

export const FIGHT_TAPE: Tape[] = [
  [0x9e7b4, 'd6', '26'],
  [0x9e9b8, '7d', '72'],
  [0x9eab5, 'd6', '26'],
  [0x9ebb4, '7d', '72'],
  [0x9ecb4, '7d', '72'],
  [0x9ee2e, 'd7', '27'],
  [0x9efb9, 'd6', '26'],
  [0x9f05f, 'd7', '27'],
  [0x9f0ae, '7d', '72'],
  [0x9f16e, '7d', '72'],
  [0x9f236, '7d', '72'],
  [0x9f36e, 'dddf', '222f'],
  [0x9f371, 'cdd0', 'c220'],
  [0x9f847, 'd7', '27'],
  [0x9fa6e, 'ee', '22'],
  [0x9fa70, '0eeeee', '022222'],
  [0x9fa74, 'eeef', 'e22f'],
  [0xa0141, '6d', '62'],
  [0xa0161, 'd7', '27'],
  [0xa029b, 'd6', '26'],
  [0xa02c4, '0e', '02'],
  [0xa02c8, 'eee0', '2220'],
  [0xa02cc, 'e0', '20'],
  [0xa02e7, 'ee', '22'],
  [0xa02eb, 'ee', 'e2'],
  [0xa0345, 'eee0', 'e220'],
  [0xa0349, 'eeeeee', 'e2222e'],
  [0xa034e, '0eee', '022e'],
]

// The faceoff close-up (FaceOffSprites, 179 tiles): tape on the toe end of each centre's stick. 22 runs, at
// offsets into its tiles (tile * 32 + byte), as a ROM with them plain has them (the CDL ROMs at $11EA92).
export const FACEOFF_TAPE: Tape[] = [
  [0xcfa, '0eee', '0222'],
  [0xcfe, '0eee', '0222'],
  [0xd38, 'eeeeee', '22222e'],
  [0xd3c, 'eeeeee', '22222e'],
  [0x1135, 'eeeeee', '222222'],
  [0x1139, 'eeeeee', '222222'],
  [0x1154, 'ee', '2e'],
  [0x1158, 'ee', '2e'],
  [0x12b2, 'eeee', '2222'],
  [0x12b6, 'eeee', '2222'],
  [0x12d0, 'eeee', '222e'],
  [0x12d4, 'eeee', '222e'],
  [0x13f7, 'ee', '22'],
  [0x13fb, 'ee', '22'],
  [0x1414, 'eeeee0', '222220'],
  [0x1418, 'eeeee0', '222220'],
  [0x1472, 'eeee', 'e222'],
  [0x1476, 'eeee', 'e222'],
  [0x1490, 'eeee', '2222'],
  [0x1494, 'eeee', '2222'],
  [0x1608, '0eeeeeeeeeeeee', '02222222222222'],
  [0x1610, 'ee', '22'],
]

// The same for the original game, which keeps the tiles packed (EA's bytecode, genesisunpack.ts): where
// its packed stream (from the anim + 10, after the tile count) changes, so that it unpacks to the tiles with
// FACEOFF_TAPE's changes. Worked out by re-encoding, at the same length, only the stretches of the stream that
// make or copy the bytes that change (221 bytes in 19 runs of its 3,794); the rest is EA's as it was. These go
// in and out together, not each alone, as later parts of the stream copy from earlier ones.
export const FACEOFF_PACKED_TAPE: Tape[] = [
  [0x9ad, '21000e5b01fff020001f5950000f86409b80000e803c5a2f20edc7990035ee', '800d5b03fff0001f5950000fc89f000102225a238dc720a8000322222eee5a'],
  [0x9d0, 'f0827051813600ee81be98fc00f09b3f2300cb21019a9c20020cc8a92002', '00e0a0010eee51c8c0c000e0fa5000f08a402f0ccb00009a9c000cc8a900'],
  [0xc42, '81159e8030ee5a81cc22e00e', '509f8030225a81cc2200ee21'],
  [0xc55, 'ee', '2e'],
  [0xccc, '00eec15a8e20000e821d4400e0854082152200e0ef3f732101889c20020caaa95801899a2002', 'e5438e20000e2203ee222eee5a00e031ff86152200e02c86df610d889c000caaa9000c899a00'],
  [0xd8e, 'e607812500ee22', 'd8ecf2070ee000'],
  [0xd96, '0e820940', '00eeee22'],
  [0xd9d, '3f00811f00e0', '232f02222220'],
  [0xda8, '9a8084cc2e010bbb200b9a9bbbd0b8a9dbd0dd8a8ddd857c858031ee00', '2b8fcc2f0e0bbb009a9bbbd0b8a9dbd0dd8a8ddd827c888004eeeee222'],
  [0xdc6, '9d7b5c891f080644', '589c7b5c891f1306'],
  [0xdcf, '6074411447445802447444d4035677', '446074411447444114447444444756'],
  [0xddf, '652b050555', '77652b0905'],
  [0xde5, '505556c00065c00065', '555055565655656550'],
  [0xe60, '80d9', 'e0fe'],
  [0xe9c, '88048036000f5800', '5e8336040f2222ff'],
  [0xea5, 'c17801f11f25010eee48', '7a01f11f25030eee0222'],
  [0xeb0, '8197', 'e12b'],
  [0xebc, '8120e2', '00ee81'],
  [0xec0, '85', '89'],
]

// NOSE4Web's first faceoff tape (2026-11-20, 15dfee5), which taped the whole blades: recognised so that it
// comes out and the toe-end tape above goes in its place.
export const FACEOFF_TAPE_FIRST: Tape[] = [
  [0xcfa, '0eee', '0222'],
  [0xcfe, '0eee', '0222'],
  [0xd38, 'eeeeeeeeeeeeeeee', '2222222222222222'],
  [0xd74, 'ee', '22'],
  [0xd78, 'ee', '22'],
  [0x1009, '0ee0', '0220'],
  [0x100e, 'eeee', '2222'],
  [0x1012, 'eeee', '2222'],
  [0x1135, 'eeeeee', '222222'],
  [0x1139, 'eeeeee', '222222'],
  [0x1151, '0ee0', '0220'],
  [0x1154, 'eeeee0', '222220'],
  [0x1158, 'eeee', '2222'],
  [0x12b2, 'eeee', '2222'],
  [0x12b6, 'eeee', '2222'],
  [0x12cf, 'eeeeeeeeeeeeeeeee0', '222222222222222220'],
  [0x13f0, '0ee0', '0220'],
  [0x13f5, 'eeeeee', '222222'],
  [0x13f9, 'eeeeee', '222222'],
  [0x1414, 'eeeee0', '222220'],
  [0x1418, 'eeeee0', '222220'],
  [0x146c, 'ee', '22'],
  [0x1470, 'eeeeeeee0eeeeeee', '2222222202222222'],
  [0x1490, 'eeee', '2222'],
  [0x1494, 'eeee', '2222'],
  [0x1608, '0eeeeeeeeeeeee', '02222222222222'],
  [0x1610, 'ee', '22'],
]

// And its packed stream for the original game (149 bytes in 29 runs).
export const FACEOFF_PACKED_TAPE_FIRST: Tape[] = [
  [0x9c0, '0e', '02'],
  [0x9c2, '3c', '33'],
  [0x9cb, 'ee', '22'],
  [0x9d0, 'f0827051813600ee81be98fc00f09b3f2300cb21019a9c20020cc8a92002', '00e0a0010eee51e2ae0122e0fa5000f08a402f0ccb00009a9c000cc8a900'],
  [0xa8d, '01', '0d'],
  [0xa90, '80f808', '00eeee'],
  [0xbc1, '00', '01'],
  [0xbc3, '80095a830d8411', 'e059860d220102'],
  [0xbcb, '00ee', 'e168'],
  [0xc42, '81159e8030ee5a81cc22e00e', '509f8030225a81cc2200ee21'],
  [0xc52, '86', '83'],
  [0xc55, 'eeee5ae219faaa8fc08fc082c001cb2b2101222088', '0220801b5ae2192a8fc08fc08fc001cb2b21804f87'],
  [0xccd, 'ee', '22'],
  [0xcd4, '821d4400e0', '22e6e031ff'],
  [0xcda, '408215', '1500ee'],
  [0xd8e, 'e6078125', 'd8ebf206'],
  [0xd93, 'ee22', '0220'],
  [0xd96, '0e8209', '000022'],
  [0xda2, 'e0', '20'],
  [0xdad, '01', '0e'],
  [0xdb0, '200b9a9bbbd0b8a9dbd0dd8a8ddd857c8580', '009a9bbbd0b8a9dbd0dd8a8ddd827c5de158'],
  [0xdc3, 'ee', '22'],
  [0xdc5, '0e', '02'],
  [0xe60, '80d9010e', '00ee7100'],
  [0xe9c, '88048036000f5800', '5e8336040f2222ff'],
  [0xea5, 'c17801f11f25010eee48', '7a01f11f25030eee0222'],
  [0xeb0, '8197', 'e12b'],
  [0xebc, '8120e2', '00ee81'],
  [0xec0, '85', '89'],
]

// The player sprites' frames that Clockwise's edit left untaped (2026-11-22): tape at the blade's end on the
// goalies' and skaters' sticks in 34 frames, and the eyes of frames 168, 615 and 627, in the sprite tiles where
// Clockwise's records are (clockwise.ts; none of these bytes is in one of his records). From the NHL94 Match
// Viewer project's records, less five frames they left out on a closer look (205, 490, 673, 721, 809). 108
// bytes in 96 runs; the frames each is in after it.
export const SPRITE_TAPE: Tape[] = [
  [0x64351, 'db', '2b'], // 89
  [0x64355, 'dd', '22'], // 89
  [0x69f3f, '7b', '72'], // 168
  [0x76905, 'ee', '22'], // 305
  [0x76909, '0ee0', '0220'], // 305
  [0x7699c, '0ee0', '0220'], // 305
  [0x769a1, 'ee', '22'], // 305
  [0x7c7de, 'e0', '20'], // 407, 539, 540
  [0x7c7e1, '0e', '02'], // 407, 539, 540
  [0x7c7e5, 'e0', '20'], // 407, 539, 540
  [0x7c7e8, '0e', '02'], // 407, 539, 540
  [0x7c90a, 'ee', '22'], // 408
  [0x7c90d, 'ee', '22'], // 408
  [0x7cab6, '0e', '02'], // 409, 659
  [0x7cab9, '0ee0', '0220'], // 409, 659
  [0x7cabd, 'e0', '20'], // 409, 659
  [0x7cbe2, 'e0', '20'], // 410, 542, 543, 544
  [0x7cbe5, '0e', '02'], // 410, 542, 543, 544
  [0x7cbe9, 'e0', '20'], // 410, 542, 543, 544
  [0x7cbec, '2e', '22'], // 410, 542, 543, 544
  [0x7ccd7, 'e0', '20'], // 411
  [0x7ccda, '9e', '92'], // 411
  [0x7ccde, '8e', '82'], // 411
  [0x7cce2, 'e0', '20'], // 411
  [0x7ce92, 'ee', '22'], // 412
  [0x7ce95, 'ee', '22'], // 412
  [0x7ffdf, '0e', '02'], // 447
  [0x7ffe3, 'e0', '20'], // 447
  [0x80038, '0e', '02'], // 447
  [0x8003c, 'e0', '20'], // 447
  [0x810e6, '0e', '02'], // 459
  [0x810ea, 'e0', '20'], // 459
  [0x8113e, '0e', '02'], // 459
  [0x81142, 'e0', '20'], // 459
  [0x8139f, '2e', '22'], // 461
  [0x813a3, 'e2', '22'], // 461
  [0x813a6, '0e', '02'], // 461
  [0x813aa, 'ee', '22'], // 461
  [0x82467, '0e', '02'], // 472
  [0x8246b, 'e0', '20'], // 472
  [0x8246e, '0e', '02'], // 472
  [0x82500, '0e', '02'], // 472
  [0x82797, 'ee', 'e2'], // 474
  [0x827ac, '0ee0', '0220'], // 474
  [0x827b0, 'e0', '20'], // 474
  [0x82a56, 'ee', '22'], // 476
  [0x82a59, 'ee', '22'], // 476
  [0x83727, '0e', '02'], // 485
  [0x837b8, '0ee0', '0220'], // 485
  [0x837bc, 'e0', '20'], // 485
  [0x839aa, 'e0', '20'], // 487
  [0x839ad, '9e', '92'], // 487
  [0x839b1, 'e8', '28'], // 487
  [0x839b4, 'be', 'b2'], // 487
  [0x83b17, 'be', 'b2'], // 488
  [0x83b1b, 'be', 'b2'], // 488
  [0x83b1f, 'e8', '28'], // 488
  [0x83b23, 'e8', '28'], // 488
  [0x83c9e, 'ee', '22'], // 489
  [0x83ca2, 'ee', '22'], // 489
  [0x83ca6, '0ee0', '0220'], // 489
  [0x83cab, 'e0', '20'], // 489
  [0x85acd, 'e0', '20'], // 511
  [0x85ad1, 'e0', '20'], // 511
  [0x85ad4, '0e', '02'], // 511
  [0x85ad8, 'e0', '20'], // 511
  [0x8600d, '0e', '02'], // 515
  [0x86011, 'e0', '20'], // 515
  [0x86014, '0e', '02'], // 515
  [0x86018, 'e0', '20'], // 515
  [0x8d6e4, 'b7', '27'], // 615
  [0x8ed5f, 'b7', '27'], // 627
  [0x91f39, '0e', '02'], // 658
  [0x91f3c, '0ee0', '0220'], // 658
  [0x91f40, 'e0', '20'], // 658
  [0x93237, '0e', '02'], // 672
  [0x93249, 'e0', '20'], // 672
  [0x9324c, '0e', '02'], // 672
  [0x93250, 'e0', '20'], // 672
  [0x934ab, 'e0', '20'], // 674
  [0x934af, 'e0', '20'], // 674
  [0x934b3, 'e0', '20'], // 674
  [0x934b6, '0e', '02'], // 674
  [0x939b5, '0ee0', '0220'], // 678
  [0x939b9, '0ee0', '0220'], // 678
  [0x939bd, 'ee', '22'], // 678
  [0x939c1, 'ee', '22'], // 678
  [0x93c14, '0e', '02'], // 680
  [0x93c18, 'e0', '20'], // 680
  [0x93c1c, 'e0', '20'], // 680
  [0x93c20, 'e0', '20'], // 680
  [0x93cf6, '0e', '02'], // 681
  [0x93cf9, '0ee0', '0220'], // 681
  [0x93cfd, 'e0', '20'], // 681
  [0x99c2c, 'eeee', 'e222'], // 754, 786
  [0x99c31, 'eeee', '222e'], // 754, 786
]
