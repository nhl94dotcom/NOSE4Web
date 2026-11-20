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

// The faceoff close-up (FaceOffSprites, 179 tiles): the centres' sticks taped. 81 bytes, at
// offsets into its tiles (tile * 32 + byte), as a ROM with them plain has them (the CDL ROMs at $11EA92).
export const FACEOFF_TAPE: Tape[] = [
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

// The same for the original game, which keeps the tiles packed (EA's bytecode, genesisunpack.ts): where
// its packed stream (from the anim + 10, after the tile count) changes, so that it unpacks to the tiles with
// FACEOFF_TAPE's changes. Worked out by re-encoding, at the same length, only the stretches of the stream that
// make or copy the bytes that change (149 bytes in 29 runs of its 3,794); the rest is EA's as it was. These go
// in and out together, not each alone, as later parts of the stream copy from earlier ones.
export const FACEOFF_PACKED_TAPE: Tape[] = [
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
