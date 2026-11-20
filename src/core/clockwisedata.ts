// The data of Clockwise's NHL 94 sprite edit (IPS), from the NHL94 forum: his
// touch-ups to the players' sprite tiles (stick tape, eye colour and other
// small details). Generated from the IPS against the original game's ROM; the
// patch's five records in the ROM's header (its title and checksum) are left
// out, so this is pixel edits only, 3498 records from $5DE91 to $9E0FB.
// See clockwise.ts.
//
// Each record: where it starts, as the distance from the end of the one before
// (CLOCKWISE_GAPS, the first from 0), and its length (CLOCKWISE_LENGTHS). The
// original game's bytes and the patched ones, the records' one after another,
// base64 (CLOCKWISE_ORIGINAL, CLOCKWISE_PATCHED).

export const CLOCKWISE_GAPS: number[] = [
  384657, 3, 245, 287, 254, 3, 252, 511, 3, 2, 16, 3, 221, 3, 2, 2, 345, 2, 2, 3, 338, 3, 2, 2, 182, 3, 60, 3, 165, 114, 2, 168, 158, 2, 123, 161, 1,
  135, 147, 3, 24, 3, 138, 208, 2, 156, 122, 3, 3, 24, 3, 152, 125, 2, 2, 154, 210, 160, 3, 28, 2, 151, 194, 3, 2, 160, 114, 3, 3, 38, 92, 153, 2, 2,
  180, 114, 3, 3, 3, 3, 3, 3, 20, 124, 123, 3, 3, 3, 2, 2, 47, 207, 3, 3, 3, 3, 30, 244, 3, 2, 1, 1, 2, 22, 245, 3, 2, 1, 2, 3, 22, 187, 2, 1, 2, 2, 7,
  255, 1, 1, 2, 19, 200, 2, 2, 2, 3, 18, 252, 2, 18, 301, 3, 24, 2, 27, 254, 1, 231, 56, 2, 28, 3, 275, 2, 266, 3, 3, 282, 3, 3, 245, 3, 3, 24, 2, 3,
  3, 272, 3, 3, 24, 3, 3, 3, 275, 3, 3, 3, 94, 3, 3, 2, 210, 3, 3, 298, 3, 3, 3, 3, 270, 3, 2, 3, 3, 271, 3, 3, 3, 3, 53, 3, 226, 3, 3, 3, 22, 3, 3,
  474, 3, 244, 3, 3, 2, 631, 113, 2, 2, 2, 98, 53, 2, 2, 2, 3, 391, 30, 2, 2, 2, 208, 3, 3, 3, 186, 40, 3, 3, 3, 174, 3, 3, 2, 2, 163, 102, 2, 2, 2, 3,
  143, 1, 96, 2, 2, 2, 3, 124, 122, 2, 2, 2, 3, 148, 182, 3, 3, 2, 2, 120, 90, 2, 2, 2, 64, 124, 112, 3, 3, 3, 3, 24, 177, 2, 2, 2, 33, 124, 120, 3, 2,
  2, 2, 26, 92, 92, 3, 2, 2, 2, 53, 147, 3, 3, 16, 3, 3, 72, 158, 2, 2, 54, 135, 2, 2, 2, 2, 103, 49, 3, 3, 3, 3, 157, 33, 3, 3, 3, 3, 3, 214, 61, 43,
  2, 2, 2, 3, 149, 252, 3, 3, 3, 23, 251, 3, 3, 2, 69, 235, 3, 2, 3, 54, 254, 3, 3, 24, 3, 3, 40, 3, 3, 3, 38, 435, 3, 2, 2, 267, 3, 2, 3, 250, 3, 3,
  2, 297, 3, 3, 2, 246, 3, 2, 3, 31, 3, 3, 3, 3, 556, 2, 2, 340, 1, 1, 43, 102, 137, 2, 242, 72, 3, 2, 118, 2, 1, 2, 281, 29, 374, 2, 351, 3, 496, 3,
  3, 20, 3, 3, 3, 230, 3, 24, 2, 57, 101, 214, 2, 39, 244, 2, 3, 48, 3, 2, 10, 388, 1, 34, 353, 3, 24, 2, 270, 3, 2, 3, 299, 3, 3, 3, 252, 3, 3, 3, 3,
  24, 3, 287, 3, 3, 54, 3, 3, 28, 3, 3, 177, 317, 2, 2, 306, 3, 20, 2, 363, 2, 2, 332, 2, 3, 3, 17, 3, 3, 3, 3, 491, 2, 2, 344, 3, 2, 2, 338, 2, 2, 2,
  57, 3, 3, 157, 122, 2, 2, 2, 53, 3, 2, 2, 106, 270, 121, 2, 3, 3, 88, 193, 3, 20, 2, 120, 185, 1, 1, 198, 142, 3, 3, 3, 359, 3, 3, 3, 285, 3, 3, 3,
  3, 341, 3, 2, 2, 2, 3, 53, 60, 63, 2, 2, 2, 107, 1, 39, 92, 96, 1, 1, 93, 60, 209, 3, 2, 333, 2, 2, 2, 2, 3, 337, 3, 3, 3, 375, 2, 2, 2, 3, 287, 2,
  33, 3, 3, 331, 3, 2, 353, 3, 2, 3, 69, 3, 3, 82, 270, 2, 3, 3, 3, 2, 58, 243, 3, 3, 3, 25, 3, 2, 2, 3, 160, 2, 2, 2, 47, 86, 102, 3, 133, 3, 2, 2,
  50, 328, 3, 2, 3, 106, 414, 2, 2, 3, 3, 59, 95, 3, 3, 3, 240, 3, 3, 2, 2, 2, 53, 65, 52, 3, 3, 3, 2, 3, 211, 278, 3, 30, 3, 58, 25, 2, 2, 33, 3, 84,
  2, 2, 17, 3, 20, 2, 3, 48, 2, 2, 3, 3, 2, 69, 1, 3, 2, 60, 3, 84, 3, 2, 24, 3, 3, 2, 2, 2, 90, 1, 1, 2, 145, 337, 3, 3, 624, 3, 28, 2, 23, 3, 3, 3,
  10, 7, 377, 3, 2, 2, 3, 231, 2, 2, 6, 509, 2, 2, 2, 3, 89, 357, 2, 87, 5, 3, 4, 3, 105, 74, 3, 32, 21, 3, 2, 28, 3, 205, 2, 2, 1, 130, 2, 373, 2, 2,
  1, 2, 78, 11, 116, 163, 3, 53, 2, 68, 3, 3, 2, 3, 884, 3, 3, 3, 600, 3, 3, 3, 3, 40, 3, 3, 3, 245, 3, 2, 310, 2, 2, 2, 191, 163, 1, 181, 161, 2, 24,
  3, 155, 162, 3, 24, 3, 29, 3, 264, 3, 2, 3, 3, 30, 3, 247, 2, 24, 3, 163, 3, 170, 2, 3, 311, 3, 3, 3, 285, 3, 2, 3, 67, 3, 4, 3, 3, 370, 3, 3, 2, 2,
  3, 24, 124, 3, 118, 40, 3, 30, 2, 2, 18, 3, 311, 2, 2, 2, 3, 113, 3, 3, 24, 2, 117, 3, 3, 3, 27, 305, 1, 38, 277, 3, 33, 1, 1, 28, 7, 260, 2, 29, 3,
  308, 3, 49, 3, 3, 268, 3, 53, 3, 3, 324, 2, 363, 2, 2, 376, 3, 3, 3, 466, 3, 3, 3, 3, 445, 2, 2, 100, 3, 3, 2, 33, 278, 2, 2, 3, 3, 42, 257, 3, 3, 3,
  2, 2, 3, 3, 375, 2, 17, 2, 2, 101, 144, 3, 116, 3, 3, 3, 478, 2, 2, 57, 24, 124, 7, 200, 48, 2, 1, 1, 377, 35, 3, 2, 3, 3, 35, 2, 344, 2, 2, 2, 45,
  3, 3, 322, 3, 3, 3, 12, 3, 3, 267, 181, 2, 2, 2, 2, 3, 3, 2, 2, 437, 2, 24, 427, 2, 2, 371, 3, 3, 3, 3, 3, 3, 280, 3, 2, 2, 2, 3, 3, 386, 3, 3, 3,
  311, 3, 3, 2, 2, 3, 3, 442, 11, 3, 2, 2, 2, 3, 2, 2, 320, 64, 3, 3, 2, 2, 347, 3, 2, 2, 13, 3, 45, 58, 303, 3, 42, 2, 2, 2, 288, 3, 3, 3, 71, 2, 2,
  6, 2, 2, 2, 1, 3, 119, 435, 3, 490, 3, 3, 3, 70, 3, 3, 3, 3, 33, 8, 254, 3, 3, 2, 2, 2, 307, 204, 3, 2, 3, 2, 2, 7, 277, 2, 2, 2, 2, 351, 2, 2, 1, 2,
  3, 1631, 338, 1005, 3, 2, 3, 3, 399, 3, 3, 3, 208, 2, 2, 3, 104, 174, 2, 155, 3, 3, 3, 40, 3, 3, 3, 74, 92, 156, 1, 1, 22, 2, 267, 3, 2, 3, 33, 243,
  3, 2, 411, 3, 2, 400, 3, 3, 3, 55, 3, 3, 481, 154, 3, 2, 2, 2, 304, 39, 2, 2, 49, 3, 30, 124, 111, 1, 45, 2, 209, 3, 3, 3, 22, 207, 4, 3, 3, 3, 148,
  3, 2, 3, 317, 399, 2, 2, 2, 3, 151, 3, 389, 84, 2, 2, 2, 2, 215, 152, 2, 2, 2, 286, 126, 3, 2, 3, 57, 298, 3, 2, 3, 346, 63, 3, 3, 487, 78, 2, 2, 2,
  320, 3, 3, 317, 3, 3, 3, 357, 11, 3, 3, 3, 3, 3, 150, 208, 76, 6, 2, 3, 22, 148, 2, 2, 2, 3, 181, 209, 2, 2, 3, 97, 303, 6, 3, 3, 3, 2, 58, 1, 2, 2,
  233, 3, 3, 53, 3, 3, 20, 3, 3, 3, 593, 3, 3, 3, 3, 3, 300, 3, 3, 373, 3, 3, 3, 161, 223, 3, 24, 2, 221, 149, 2, 3, 2, 160, 136, 1, 2, 2, 233, 261, 3,
  14, 2, 1, 2, 371, 2, 3, 3, 276, 3, 28, 3, 2, 26, 174, 3, 3, 1, 1, 2, 2, 61, 56, 3, 271, 2, 2, 62, 230, 1, 117, 179, 3, 2, 3, 463, 3, 2, 3, 65, 3, 3,
  3, 518, 3, 2, 2, 442, 3, 3, 3, 2, 3, 178, 281, 2, 2, 2, 197, 3, 3, 3, 3, 104, 3, 211, 3, 3, 3, 3, 3, 366, 3, 2, 3, 2, 3, 3, 415, 2, 28, 2, 251, 3, 3,
  2, 3, 2, 3, 77, 200, 3, 3, 3, 125, 347, 3, 3, 3, 150, 312, 3, 3, 2, 2, 195, 7, 3, 3, 2, 3, 94, 3, 3, 2, 42, 2, 283, 3, 2, 2, 2, 18, 2, 330, 3, 2, 2,
  2, 3, 3, 52, 3, 2, 2, 137, 2, 322, 3, 183, 41, 3, 3, 2, 3, 481, 8, 2, 2, 2, 2, 300, 3, 3, 3, 3, 3, 214, 3, 343, 1, 1, 111, 238, 3, 2, 2, 2, 3, 228,
  4, 82, 3, 2, 2, 2, 2, 3, 279, 4, 121, 2, 2, 1, 2, 2, 155, 4, 111, 2, 420, 71, 3, 3, 2, 2, 2, 276, 152, 2, 2, 2, 131, 206, 2, 2, 3, 410, 108, 3, 2, 2,
  3, 3, 299, 1, 1, 42, 152, 2, 2, 2, 394, 2, 2, 1, 2, 2, 3, 348, 2, 1, 2, 2, 401, 2, 2, 1, 2, 2, 3, 678, 3, 3, 330, 3, 32, 2, 3, 248, 3, 3, 356, 2, 3,
  3, 3, 60, 3, 3, 3, 806, 3, 3, 3, 3, 182, 3, 3, 153, 3, 2, 3, 337, 3, 3, 2, 2, 750, 3, 3, 3, 3, 3, 3, 433, 3, 2, 2, 2, 297, 3, 2, 2, 2, 9, 3, 3, 485,
  2, 2, 559, 2, 2, 2, 384, 2, 1, 2, 342, 2, 2, 17, 2, 2, 332, 2, 2, 3, 3, 3, 494, 3, 2, 2, 433, 3, 2, 3, 309, 3, 1, 3, 218, 2, 2, 492, 3, 2, 2, 458, 2,
  3, 3, 2, 321, 3, 2, 2, 61, 3, 3, 337, 3, 3, 739, 2, 2, 1, 3, 385, 2, 2, 70, 2, 2, 2, 352, 2, 2, 2, 317, 3, 57, 3, 330, 2, 2, 17, 3, 490, 1, 1, 1,
  303, 2, 2, 411, 3, 3, 3, 2, 296, 3, 3, 2, 2, 267, 3, 2, 50, 240, 2, 73, 310, 2, 2, 2, 355, 2, 2, 2, 2, 40, 4, 226, 3, 2, 313, 2, 3, 312, 3, 363, 3,
  3, 3, 3, 348, 2, 3, 3, 3, 302, 3, 3, 3, 3, 379, 3, 3, 2, 393, 3, 3, 2, 2, 33, 279, 2, 2, 2, 3, 3, 439, 2, 2, 2, 2, 3, 3, 239, 3, 3, 2, 288, 2, 2, 3,
  3, 158, 2, 2, 73, 3, 3, 8, 3, 3, 3, 527, 3, 3, 3, 41, 3, 273, 2, 3, 3, 138, 2, 3, 3, 2, 2549, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 4, 1, 5, 1, 1, 1,
  1, 1, 1, 1, 2, 17, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 4, 2, 4, 2177, 65, 3, 3, 158, 40, 3, 3, 372, 3, 3, 3, 3, 3, 3, 3,
  148, 80, 3, 3, 80, 2, 2, 2, 144, 52, 3, 3, 44, 3, 3, 385, 74, 2, 258, 2, 2, 264, 3, 3, 88, 2, 2, 300, 170, 2, 2, 156, 179, 2, 2, 98, 34, 3, 2, 3,
  508, 3, 3, 3, 219, 72, 3, 3, 3, 3, 3, 3, 179, 35, 3, 3, 2, 2, 236, 50, 2, 2, 2, 2, 3, 2, 386, 3, 2, 402, 3, 3, 138, 3, 3, 233, 737, 3, 3, 3, 3, 244,
  3, 48, 3, 3, 505, 3, 2, 2, 2, 3, 153, 183, 2, 2, 16, 3, 3, 165, 175, 1, 1, 176, 155, 3, 24, 2, 156, 111, 3, 3, 3, 2, 2, 430, 3, 3, 2, 3, 16, 3, 3,
  416, 1, 1, 102, 275, 2, 2, 2, 3, 30, 3, 3, 40, 1, 310, 133, 263, 3, 29, 2, 69, 302, 2, 3, 3, 438, 3, 3, 3, 373, 2, 2, 2, 690, 2, 3, 3, 165, 3, 322,
  3, 105, 29, 3, 3, 2, 3, 149, 61, 2, 2, 121, 2, 2, 82, 3, 3, 113, 2, 1, 60, 257, 3, 88, 3, 2, 119, 3, 1, 2, 2, 493, 193, 15, 3, 3, 3, 21, 3, 3, 493,
  2, 2, 570, 3, 2, 3, 627, 6, 3, 3, 2, 2, 3, 524, 3, 92, 3, 3, 431, 1, 71, 302, 3, 3, 2, 2, 2, 2, 284, 204, 3, 3, 24, 3, 2, 2, 455, 2, 1, 2, 68, 92,
  64, 3, 2, 2, 2, 244, 143, 2, 2, 2, 245, 3, 2, 283, 3, 3, 92, 3, 97, 1184, 64, 3, 3, 706, 6, 3, 2, 2, 2, 3, 622, 2, 1, 58, 114, 144, 2, 2, 3, 384, 3,
  24, 3, 2, 2, 325, 2, 2, 51, 113, 60, 288, 2, 2, 257, 3, 1, 3, 275, 2, 2, 32, 104, 71, 3, 2, 2, 2, 36, 669, 54, 2, 2, 1906, 2, 2, 219, 3, 3, 363, 2,
  2, 3, 269, 2, 2, 275, 1, 1, 64, 393, 1, 1, 236, 38, 2, 2, 307, 2, 2, 49, 233, 70, 2, 150, 82, 2, 258, 96, 3, 24, 3, 2, 361, 3, 3, 68, 2, 3, 303, 3,
  3, 2, 3, 24, 3, 3, 326, 3, 28, 3, 4, 143, 3, 2, 2, 135, 380, 2, 2, 76, 206, 3, 3, 3, 45, 229, 2, 2, 2, 3, 67, 2, 2, 2, 338, 51, 3, 2, 2, 74, 73, 3,
  2, 2, 7, 304, 388, 2, 2, 182, 125, 1, 1, 319, 59, 292, 2, 526, 3, 677, 3, 3, 3, 410, 2, 2, 281, 1, 1, 2, 580, 3, 2, 3, 291, 3, 92, 3, 574, 3, 3, 113,
  2, 2, 346, 142, 7, 3, 351, 3, 3, 130, 3, 2, 2, 432, 3, 3, 30, 2, 2, 388, 35, 480, 1, 1, 97, 2, 3, 795, 2, 2, 332, 2, 2, 2, 251, 3, 2, 3, 405, 2, 2,
  2, 437, 3, 3, 322, 3, 2, 3, 534, 3, 3, 416, 3, 2, 3, 25, 219, 3, 2, 3, 346, 1609, 61, 3, 3, 251, 3, 3, 3, 145, 65, 3, 3, 150, 76, 3, 3, 20, 2, 2, 2,
  201, 80, 3, 3, 20, 2, 2, 2, 168, 76, 3, 245, 2, 2, 378, 2, 2, 338, 2, 2, 213, 76, 3, 2, 3, 133, 4, 75, 3, 2, 3, 229, 71, 3, 2, 3, 57, 3, 4, 67, 3, 3,
  3, 158, 80, 3, 3, 3, 166, 76, 3, 3, 3, 226, 3, 3, 251, 3, 3, 243, 3, 3, 1032, 3, 3, 590, 2, 3, 193, 3, 88, 3, 284, 2, 2, 2, 2, 151, 114, 2, 3, 164,
  115, 2, 3, 174, 101, 2, 2, 2, 206, 124, 3, 3, 53, 2, 36, 124, 54, 2, 2, 131, 124, 54, 2, 2, 49, 81, 2, 3, 200, 81, 3, 3, 193, 57, 2, 362, 2, 3, 79,
  498, 2, 3, 337, 2, 1, 1, 402, 2, 3, 514, 3, 3, 239, 2, 2, 164, 159, 2, 2, 2, 221, 3, 49, 34, 3, 235, 45, 78, 111, 2, 2, 182, 116, 3, 24, 50, 101, 21,
  108, 2, 50, 210, 2, 61, 271, 2, 3, 56, 3, 39, 179, 3, 102, 247, 3, 130, 243, 2, 3, 414, 3, 3, 338, 2, 2, 334, 2, 3, 3, 572, 3, 28, 2, 3, 391, 3, 358,
  3, 311, 3, 2, 3, 513, 3, 303, 2, 1, 139, 339, 3, 2, 2, 26, 355, 113, 3, 35, 284, 3, 190, 3, 22, 3, 3, 134, 105, 2, 2, 194, 6, 198, 2, 2, 277, 2, 2,
  2, 516, 3, 3, 2, 2, 111, 404, 3, 116, 3, 39, 678, 3, 3, 244, 2, 348, 2, 2, 2, 166, 335, 2, 2, 31, 17, 3, 3, 57, 753, 3, 2, 163, 125, 3, 3, 24, 3, 2,
  3, 163, 2, 796, 3, 416, 3, 2, 47, 3, 3, 117, 429, 3, 3, 444, 124, 183, 2, 2, 221, 1, 1, 2, 167, 933, 2, 2, 21, 3, 3, 502, 2, 25, 2, 2, 2, 138, 124,
  721, 2, 1, 1, 2194, 120, 2, 3, 191, 1, 1, 600, 422, 2896, 54, 3, 326, 3, 3, 249, 92, 48, 2, 2, 2, 226, 3, 3, 76, 3, 185, 3, 2, 2, 86, 3, 2, 222, 75,
  3, 120, 2, 121, 3, 26, 60, 3, 3, 280, 80, 82, 2, 1, 1, 3, 2, 175, 3, 3, 2, 3, 4, 306, 3, 3, 80, 3, 3, 3, 99, 11, 3, 118, 2, 2, 308, 63, 3, 88, 3, 3,
  620, 797, 96, 139, 3, 237, 2, 56, 2, 2, 513, 3, 287, 3, 3, 786, 93, 34, 53, 3, 173, 134, 169, 3, 3, 149, 68, 2, 157, 91, 1, 1, 1, 161, 3, 3, 24, 90,
  2, 2, 271, 59, 2, 2, 120, 139, 2, 2, 2, 3, 84, 86, 2, 2, 3, 24, 287, 243, 2, 2, 3, 297, 75, 1, 1, 1, 1, 53, 3, 3, 111, 194, 3, 78, 61, 3, 2, 3, 294,
  2, 3, 3, 2, 22, 208, 216, 1, 1, 196, 3, 3, 116, 1, 1, 2, 3, 111, 2, 2, 239, 2, 293, 265, 2, 2, 2, 206, 192, 1, 2, 2, 390, 3, 263, 71, 3, 2, 3, 337,
  2, 2, 499, 3, 3, 2, 2, 434, 2, 3, 3, 277, 3, 3, 3, 3, 104, 136, 3, 248, 3, 2, 3, 3, 248, 3, 112, 3, 3, 696, 2, 2, 3, 634, 3, 2, 299, 3, 46, 3, 266,
  3, 3, 24, 3, 167, 2, 2, 67, 3, 3, 3, 314, 3, 3, 70, 3, 3, 154, 277, 3, 3, 22, 350, 265, 197, 3, 3, 148, 35, 2, 2, 218, 64, 3, 30, 1, 1, 213, 88, 2,
  3, 2, 145, 133, 2, 2, 26, 1, 1, 110, 2, 2, 2, 114, 2, 2, 2, 45, 117, 3, 24, 3, 167, 117, 3, 20, 3, 49, 291, 3, 37, 2, 2, 6, 186, 3, 2, 57, 96, 3, 2,
  2, 2, 193, 212, 3, 47, 208, 2, 3, 3, 30, 295, 3, 2, 3, 72, 243, 2, 2, 2, 3, 25, 253, 2, 2, 22, 181, 1, 1, 2, 19, 2, 2, 90, 7, 43, 2, 2, 2, 3, 284, 2,
  1, 3, 433, 2, 2, 2, 2, 2, 229, 3, 28, 3, 106, 2, 2, 2, 121, 2, 2, 3, 94, 3, 2, 2, 2, 362, 3, 2, 2, 2, 2, 1, 23, 3, 2, 2, 57, 2, 100, 128, 6, 3, 3, 7,
  3, 3, 3, 32, 3, 3, 7, 3, 3, 3, 234, 2, 2, 2, 3, 208, 88, 3, 3, 16, 1, 1, 6, 3, 1, 2, 96, 69, 2, 2, 2, 2, 427, 2, 3, 48, 1, 403, 2, 2, 2, 2, 219, 290,
  3, 82, 2, 147, 216, 3, 3, 3, 3, 309, 2, 419, 2, 12, 3, 2, 3, 333, 3, 3, 560, 2, 2, 298, 2, 72, 2, 2, 2, 6, 107, 2, 2, 3, 13, 2, 2, 2, 169, 3, 2, 3,
  59, 2, 129, 2, 95, 2, 3, 3, 31, 30, 2, 2, 3, 94, 3, 2, 2, 128, 3, 3, 2, 3, 21, 3, 40, 3, 3, 3, 51, 3, 3, 8, 1, 2, 36, 3, 4, 4, 4, 86, 2, 37, 1, 2, 4,
  1, 1, 2, 3, 31, 6, 212, 3, 3, 3, 137, 1, 1, 3, 2, 1, 2, 116, 3, 3, 7, 113, 194, 2, 3, 3, 2, 49, 3, 129, 2, 198, 3, 3, 24, 3, 3, 55, 2, 3, 3, 3, 131,
  130, 2, 2, 2, 75, 2, 2, 2, 2, 99, 213, 2, 2, 36, 3, 8, 2, 2, 74, 3, 57, 115, 3, 2, 3, 3, 296, 3, 3, 3, 88, 3, 3, 60, 3, 3, 180, 3, 2, 3, 192, 2, 1,
  2, 3, 2, 2, 3, 154, 2, 2, 2, 3, 68, 536, 2, 117, 237, 3, 3, 196, 177, 3, 2, 3, 2, 98, 31, 2, 2, 3, 94, 3, 2, 2, 190, 2, 1, 1, 335, 2, 2, 2, 659, 2,
  2, 2, 340, 2, 2, 2, 52, 3, 2, 2, 2, 696, 1, 1, 82, 257, 303, 2, 1, 1, 2, 30, 475, 44, 2, 111, 3, 3, 59, 269, 3, 2, 3, 2, 95, 60, 3, 3, 48, 3, 3, 3,
  93, 97, 3, 2, 2, 2, 269, 3, 2, 24, 24, 2, 2, 2, 516, 3, 1, 169, 88, 2, 2, 1, 235, 3, 2, 2, 101, 394, 61, 3, 2, 2, 3, 289, 17, 3, 3, 24, 3, 2, 323,
  25, 3, 21, 2, 2, 23, 3, 2, 3, 660, 3, 2, 139, 107, 3, 3, 354, 55, 2, 2, 50, 4, 3, 8, 3, 4, 2, 3, 3, 292, 56, 2, 2, 2, 275, 1, 1, 30, 26, 2, 2, 67, 3,
  48, 3, 3, 280, 75, 3, 3, 3, 313, 3, 2, 3, 3,
]

export const CLOCKWISE_LENGTHS: number[] = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 1, 3, 3, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 2, 1, 1,
  1, 2, 2, 3, 2, 2, 2, 1, 1, 2, 2, 2, 1, 3, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2,
  3, 2, 1, 2, 1, 1, 2, 2, 1, 1, 2, 2, 2, 2, 2, 1, 2, 2, 3, 2, 1, 2, 1, 2, 2, 1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 1, 3, 2, 1, 2, 2, 1, 1, 2, 2, 1, 2, 1, 1, 2,
  1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 2, 1, 1, 2, 2, 2, 1, 1, 1, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 2, 2, 1, 1, 2, 1, 1, 2, 2, 1, 1, 2,
  1, 2, 2, 1, 1, 2, 1, 1, 1, 2, 2, 2, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 2,
  1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 2, 2, 1, 1, 1, 2, 2, 1, 1, 2, 2, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 3, 2, 1, 2, 2, 2, 2, 1, 2, 2, 1, 2, 2, 1, 2,
  1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 3, 3, 1, 1, 1, 2, 2, 1, 2, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1,
  2, 2, 1, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 2, 2, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 1, 1, 2, 3, 2,
  1, 1, 1, 2, 2, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 2, 2, 2, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2,
  2, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 2, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1,
  2, 2, 2, 1, 1, 2, 2, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 1, 2, 2, 1, 1, 2, 2, 2, 1, 2, 3, 2, 1, 2, 1, 2, 1, 1, 1, 2, 2, 1, 1, 1, 1,
  1, 1, 1, 1, 2, 1, 1, 2, 2, 2, 1, 1, 2, 2, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2,
  2, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 2, 1, 1, 3, 3, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 2, 2,
  1, 1, 2, 1, 2, 3, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1,
  1, 1, 3, 3, 1, 1, 1, 2, 3, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 2, 2, 2, 3, 2, 1, 2, 2, 1, 1, 2, 1, 2, 1, 2, 2, 2, 1, 1, 1, 2, 1, 2, 2,
  1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 2, 2, 1, 2, 1, 2, 2, 1, 1, 1, 1, 1, 2, 3, 2, 2, 1, 1, 1, 2, 1, 2, 3, 2, 2, 1, 2, 2, 1, 1, 2, 1, 1, 2, 2, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 2, 1, 2, 2, 1, 2, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 2, 2, 1, 1, 1,
  1, 1, 2, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 2, 1, 1, 2, 1, 1, 1, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 2, 2, 1, 2, 1, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 2, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 2, 2, 2, 1, 2, 2, 1, 1, 1, 3, 2, 1, 2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1, 3, 3, 2, 3, 1,
  1, 2, 1, 1, 1, 1, 2, 2, 1, 1, 3, 2, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 2, 1, 2, 2, 1, 2, 1, 2, 2, 1, 2, 1, 3, 2, 1, 1, 1, 2, 2, 1, 2, 2, 2,
  2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 2, 2, 1, 1, 2, 1, 2, 1, 1, 1, 2, 2, 1, 1, 2, 2, 2, 3, 2, 2, 1, 2, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 1, 1, 2, 1, 1, 2, 3, 2, 1, 1, 1, 1, 2, 2, 1, 2, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1,
  1, 3, 2, 2, 1, 1, 1, 1, 2, 3, 2, 1, 3, 3, 1, 2, 2, 2, 1, 1, 2, 2, 1, 1, 2, 1, 1, 1, 2, 2, 2, 1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 1,
  1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 2, 2, 1, 1, 2, 1, 2, 1, 1, 2, 2, 1, 2, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 2, 2, 1, 1, 2,
  2, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 2, 2, 2, 1, 1, 1, 2, 2, 1, 1, 2, 2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 3,
  2, 1, 1, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 1, 2, 1, 1, 1, 2, 3, 1, 2, 2, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1, 2,
  2, 1, 1, 1, 2, 2, 2, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 2, 1, 1,
  2, 2, 1, 1, 1, 1, 2, 3, 2, 1, 3, 2, 1, 1, 3, 3, 1, 1, 2, 1, 1, 2, 2, 2, 2, 2, 1, 2, 2, 1, 2, 2, 2, 1, 2, 1, 1, 1, 1, 1, 2, 2, 2, 1, 2, 2, 1, 1, 2, 2,
  1, 1, 2, 2, 1, 1, 2, 1, 1, 2, 2, 1, 1, 1, 1, 3, 3, 1, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 1, 1, 2, 1, 1, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 1, 1,
  1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2,
  2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 10, 59, 47, 12, 3, 3, 19, 3,
  3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 15, 27, 3, 3, 2, 32, 90, 124, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1,
  1, 1, 2, 2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 2, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 2, 2, 2, 1, 2, 2, 2, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 3,
  2, 2, 1, 1, 2, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 2, 3, 2, 2, 1, 2, 2, 1, 1, 1, 1, 1, 3, 3, 2, 1, 1, 1, 2, 2, 1, 2, 2, 1, 1, 1, 2, 2, 1,
  2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 2, 1, 2, 2, 1, 1, 1, 1, 1, 3, 4, 2, 1, 1, 1, 2, 2, 1, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2,
  2, 1, 2, 2, 1, 2, 2, 1, 1, 2, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 3, 3, 2, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 3, 2, 2, 2, 2, 2, 1, 1, 1, 2, 3, 2, 2, 2,
  1, 2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 2, 8, 3, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 3, 2, 2, 2, 1, 2, 1, 1, 2, 2, 2, 1, 3,
  3, 1, 1, 2, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1, 1, 2, 2, 1, 2, 2, 1, 2, 2, 2, 2, 2,
  2, 2, 1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 1, 2, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 2, 2, 1, 1, 1, 1, 2, 1, 2, 2, 1, 1, 1, 2, 2, 1, 2,
  1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 3, 2, 1, 1, 2, 2, 1, 1, 1, 2, 2, 1, 1, 2, 1, 2, 3, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1,
  1, 2, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 2, 1, 2, 2, 3, 2, 2, 2, 1, 1, 2, 2, 1, 2, 2, 2, 1, 2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1,
  2, 2, 1, 2, 1, 2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2, 1, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1,
  1, 2, 2, 1, 1, 1, 1, 2, 2, 1, 2, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 2,
  1, 1, 2, 2, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 2, 2, 2, 1, 2, 1, 1, 1, 1, 2, 2, 1, 2, 1, 1,
  2, 2, 1, 1, 2, 3, 2, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 2, 1, 2, 1, 1, 1, 1, 2, 1, 3, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1,
  2, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 2, 1, 2, 1, 1, 1, 1, 2, 2, 1, 2, 1, 2, 1, 1, 2, 2, 1, 2, 1, 1, 3, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1,
  2, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2,
  1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 2, 1, 2, 3, 2, 1, 2, 2, 2, 2, 1, 1, 1, 2, 2, 1, 2, 2, 1, 1, 1, 1, 2, 3, 2,
  1, 2, 1, 1, 2, 3, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 3, 2,
  2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 2, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 9, 1,
  1, 1, 1, 2, 2, 2, 1, 3, 3, 2, 1, 1, 1, 2, 2, 2, 2, 1, 2, 2, 2, 1, 1, 2, 2, 1, 1, 1, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 2, 1, 1, 1, 2, 1,
  12, 1, 1, 2, 2, 1, 2, 2, 1, 2, 2, 1, 2, 3, 3, 3, 1, 1, 1, 3, 3, 2, 2, 1, 2, 2, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 1, 2, 2, 1,
  1, 1, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 2, 2, 1, 1, 2, 1,
  1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 2, 1, 1, 2, 3, 2, 2, 2, 1, 1, 2, 2, 1, 2, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1,
  1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 3, 2, 2, 1, 2, 2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 2, 2, 1, 1, 1, 1, 2, 2, 1, 2, 3, 2, 1,
  2, 2, 2, 1, 1, 1, 2, 2, 1, 1, 1, 3, 1, 1, 1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 2, 2, 2, 1, 2, 2, 2, 1, 1, 1, 2, 2, 1, 2, 1, 2, 2, 2, 3, 2, 1, 2, 3, 2, 2, 2,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 3, 3, 2, 1, 2, 3, 2, 1, 1, 2, 2, 2, 1, 2, 1, 1, 2, 2, 1, 2, 2, 2, 2, 2, 2,
  1, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 1, 2, 1, 2, 1, 1, 1, 1, 2, 2, 3, 2, 2, 2, 1, 2, 1, 2, 1, 2, 2, 1, 2, 2, 2, 2, 1, 1, 2, 2, 1, 1, 2, 3, 1, 2, 2, 1, 1,
  1, 2, 2, 2, 1, 1, 2, 2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 2, 1, 1, 1, 1, 1, 2, 2, 2, 1, 2, 1, 1, 3, 2, 1, 1, 1, 1, 1, 1, 1, 3, 1, 1,
  1, 6, 3, 1, 1, 1, 1, 1, 2, 2, 2, 1, 2, 2, 1, 2, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 2, 2, 2, 1, 2, 2, 2, 1, 1, 2, 2, 1, 1, 1, 2, 2, 2, 1, 1,
  1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 2, 1, 1, 3, 3, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 1, 2, 2, 2, 2, 1, 1, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2,
  1, 1, 2, 2, 2, 1, 2, 3, 2, 1, 2, 2, 1, 2, 2, 2, 1, 1, 2, 2, 1, 1, 1, 2, 2, 1, 2, 3, 2, 1, 1, 1, 2, 3, 2, 1, 1, 1, 2, 2, 1, 2, 1, 1, 1, 2, 2, 2, 2, 1,
  1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 3, 3, 1, 1, 2, 2, 2, 1, 2, 3, 2, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1,
  1, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 2, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 2, 1, 2, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1,
  2, 2, 2, 1,
]

export const CLOCKWISE_ORIGINAL =
  'Dg4ODg4O7w7uDu/u7w7uDu/u7g7v7u8O7g7v7g7u7u997u7u7tbu7u7u1u7u7u7u7tbu7u7u1u7u7u7W0O7u7u7u7tbQ7uDu7u7+7n1tfW3u7u7u7u59be7u7u7u7tbX7u7u1tcO4A7vDu99bQ7v7+' +
  '7u7v4O8H1t7u7+DuAO7w7vfW3u7u7u7tbXDg4O7g7u7+7v7g1t7u7u7+7u7u/W1w7u7u8O7u7v7g1tDu4O7u/u7+4Nbe4O7u7v7u9t7u7u7m3u7u7u7u7X7u7u7u7X7u7u7u7u7u7u7u7+4O7u/uDu' +
  'Dv4P7uD+7u7u7u7u/uDu7v7u/uDu/uDu7uAO7u4O4O7u7g7u7uAO7u4O4ODu7g7g7uDu7g7g4OAODuDu7ukOew7gDuAO4O627g7u7uDu4HvuDu7u4O4O7u7gtg4O7u4O7u4O7u7gtrDuDu7u4O7utr' +
  'Cn7g7u7uDu4Law7g7u7uDu4LawDu7uDu7u4Law7g7uDuDu4HtrDu7u7uB7a+4O7g7g7uB7aw7uDu4O4O57aw7uDu7u4O5raw7u7u7u4Atr7u7u7uILa+4O7g7g7uDuC2suLu7u4ba34O7u7g4OALa3' +
  'AA7gDuAA7u5rDu7u4Lfg7u7gDu5r7u7gDu7ua+7uDuDu7uDu7g5r7u7gDuAO7u7u4A7u7uDu7uAO7uDu7uAO7u7u4A7u7gDg4P4O7u7u7g7u7u7u7u591tDu7u7u1tfg7u7+7u7u7u7u7tbX1+7u7u' +
  '7u4O4O7u4O7u7v7u7u7u7u1n1t7u7u7tbX7uDu4P/v7u7+7tbX7u7u7u7u1+7u7u7u7u7u4P7u7u7u7g7g4O7uDg7g7uDu7u7uDg4O4O8IDg7u7g7u7uDgDuAO4A7gDuAO4O7u4O7u7u7uDu/uDu4O' +
  '4O4ODu7u4O7u7uC7Du4O4A7g7u7uDuAO4L29dg7g7u7g1+7u7u7u7s12Du7u7u7u4L127u7u7u7uDu7u4A4O7u7gDu4O7u7g7uB2ew3dDd393f3d7u7u7u7udn3u7u7u7u7gt2fg7u4O7gDu4A7gDu' +
  'AO7u7u7u7u7g7u7uDu4P7g/uD+4O7u4O7uDu4O7u7gDu7u4O7u4AfXDuAO7u7u7uAO4AfXDg4O7u7uDu4O4ODuzu6e7O7sfX0O4A7g7u/ufe7u4A7u7gfXDuAO4A7u7u5t7u7u7u7u7g7gDuAO4Nvb' +
  '4O7uDu4O7uBt7u7u7tsN3O3cDdsN3dzU3dzd0P0N3dHd0dDd0eDu7uAO4G3t3dDc3d3d2t3V3dDuDg7gDuAA4ADd0P3d0N3R3Q7g7g7u7u7+7uD+7uDg4OAPD+7uDuAO7t3c3dgN2v/uDu7u7+7vcu' +
  '7u7u59gqIrK20g4i/g7u7+7u7u7g7u7u8O7u7v7g4O7u7v7u7u25fL7u7u7u7u4O7u4P7u7uDg7v4ODg7u7u7g7+8O7g7v7g7vDu/ufe7u7u7u7n3u7u7u7u7W7u7u7n1td+Du4P7u4ODwfW137u7u' +
  '7u7ufW137u7+7u7u7u7u7g7+4P7u7u7+4PAP4O7u4P7g/u7uDW13Ce7u7u7u7/ANbXfuDu7u7+7v7u7v1td3Du7u79fu7u7u7u7X7u4O7u7u7u7v13bu7u7u7u7u7u7u7u7u7u7u7u7u7u7u7uAO7u' +
  '4O7u7u7u7u7u4O4O4O4O7u4O7uDu4O7u4O4G0O4O7g7uDgeeDu7u7gDuAO7u7uDu7u4O7u4O7W0NbaquDu7g7u4O7u7u7u1td9bdcO7u7u7g7u4O7u1tfu7uAO7u4ODW2qDg7u7u7uDu7uDu7u4O7u' +
  '4AvuDu4O4O7g7u7g7uDuDu7u7u7u4O7u7g7uDg4O7u7g4O7uDuAO4O7u4O7uDg7g7u4O4A7gDuDg7n3MzAzADMDMzAzAwH3u7g7gDuAO4A7uLuDu7uDW0H1t7u4A7gDuAO4O4ODg7u7uAO4A7gAO4A' +
  '7gDuAO4H3u7m3W13fu4ODgDg4O7u7W19cO7u4O4A7g7m3u7g7uDu4O4ADuDuAO4O4O4A4O7u7gDu7u4Gpt7u7gDu7uDuDg7g7uDuDu4Na7u7u9Du7u4A7u7uDW1w7u7u7u7uCLzL274O7uDu4Obe7u' +
  '7uDu7u7u7g7u7g7g7g7g4ODWDu4O7u7g7rvQ7u7u7u7ufW3u7u7u7u6LzL273eDuDu7ubQ7uDu7u7u7u7u7g7u4OfQ7gDuDu4O7uvdfW7g7g7g7g7tbQ7g7u7uDu1tfg7uAO7g7W1+7u7uDu7g7X7u' +
  '7u7u7u7gAO4A7gDuDuDuDu7u4ODn0ODu7u4ODW2u7uDuDu7n1t7g7u7uDu4NbX7r7g7uttDuAA4O7uDuAO7t3cAu3b3dvd0O7u7u7g7g7v7w4O4ODu7g4ODu7vDg7u4Nbu7u7u7u7WDuDu7g7gd+Du' +
  '7v7u7v7uB+7u7u7u7u7u7uD+7v7u7u7u7u7uDu7XDu7uDu7v7u/u8A/W7u/u4O7u7g7u1+7u7u7u7m0O4O7u7u7u4O7g/u7+7g7g7g7u7uAO4A7g4O7uDuAO7u63Dg7u7u7u4O7uDg7g4ODg7u4ODu' +
  '7u4A7u7uAO7u4O7u7u7u7u7u7g7u7gDu7u4A7u7nfg7g7g7nfg7u4Ofe7u7uAO7w7u1u7uDuAO4O7u7g7gDuDXfe7uDu4O4O7efe7uDuAO4A7u7u7uDu4O79d9dnZ31tDu7g7gDu7ufW3uDu4O4O7g' +
  '7g4O7u7g4Hdn7u7u7u7u731tDu4O7g7g7u591+7uDu4O4O7g7u4N1+4O7u7gDu7u4O591+7g7u7W1w4O7g7uDuDudw7gDuAO4O53DuAO4O7g1+7u4P7gDu7u7u7u7u7u7tfuDuAO4O7uDu7u4A7u7u' +
  'Du4A7u7u8O7u7v7u4O7u7gDu7u4O7g7u7uDu7u7uD+7u7u7uDu7u4ADuDg7u4O4O4O4O7v7g7v7g7v7u7uDuDu4A7u7uAO7u4O4O7gDg7u7u7g4A7uDu7u7+4O7g7u7uDu7u7gDu7u4OAODu7u4ODu' +
  '7u7u7u4O7u7+7+7u7u4ADuAO4O7uDuDu7u7u7g7u7u7u4O7uDu7u7uAO7u7u7u7u7u4O7w7vDu/u4P7u7u7g/u7uDuAO7w7v7u7u7uDuDu4O7u7gDu7gDu7u7+7uDu7u7+7uDu7u4O7u7u7g7g7u7u' +
  'Dg7uDuDu7u7u7v7g7u7uDg7u7uDuAO4O7u7g7gDuDu7g7gfe4O4H1t7g7gDuAO4O4O4A7gDuDuDW3X7u4O4A7g7u7u7uDu7g4ODuAO4O7u7u7u7g4O7u4O4A7g7u7uDuAO4HfuDu7u4O7g4O4O7g7g' +
  '7uDu4ODu7u4O4A7gDuAO4O7uDu7u4OAO7uDuDuDuDg4O7u7u7g7g7u7uDuDu7u4O4BoBoxowowEKMBABoQE6EBAxFxcXd3cxcwMXcBAxcQEBp3UVATF1qqqqoaGhoTowEBABAQEBEBAQEAEBAQEQEB' +
  'AQAQEBARAQEBAXFxcXd3d3dwMDAwMQEBAQAQEBARUVFRWqqqqqoaGhoRAQEBoBAQEBEBAQGgEBAQEQEBAaAQEBARAQEBcXFxcXd3d3dwMDAxAQEBoBAQEBFRUVFToXcKEBcKAXcAGhAXAKMBdwCgEB' +
  'cAowF3CjAXCgN3CjAXA6N3AKEXCqcAB3dwEXFwcQEAGhAQcwEAejAQEaBxGjAXAaBxAQAXEBBxAQAXEBBxAQAXEBBxAQAXEBFxAQATFxARoQEBCjAQEBEBAQoQEBATAQEBChAQEBMBAQEKMBAQEKEB' +
  'AQoQEBChoaqqp3d3d3FxcXFxAQEBABAQEBEBAQEAEBAQEQEBAQAQEBARAQoaGhoQqqqqoQEBAQAQEBARAQEBABAQEBEBAQEAEBAQEQEBAQAQEBARAQEBABAQEBEBAQEAEBAQEQEBAQAQEBARAQEBAB' +
  'AQEBEBAQEAEBAQEaGhoaqqqqqnd3d3cXFxcXEBAQEAEBAQEQEBAQAQEBARAQEBABAQEBEBAQEKGhoaGqqqqqEBAQGgEBAQoQEBAaAQEBChAQEBoBAQEKEBAQGgEBAQoQEBAaAQEBChAQEBoBAQEKEB' +
  'AQGgEBAQoQEBAaAQEBChAQEBoBAQEKGhoaGqqqqqqdjo6O2Q7u7g4ODu7u7u/vnZ0O7u4O7u7u7u/v2dDu7uue7u7Z7u7u7u7u7u7u7u7u7u7u7u4O7tnQ7uDu7v7u2dnu7v7u7v7u2dnu7u0O7u7v' +
  '7+/vnQ4ODu7u7u/Z7u7gDuAO4Nna7g7uDu/u7+7vAOAO7u3uDunrDu7rneDgDg4ODu4O7u/u7g7g7uDu7tkO7u7u7w7u7tnu7u7u7u7Z0O7u7u7u7p2dDg7u7g7uDuDg7u7g/u7u4O7u7u7u7u7u4A' +
  '2d7g7u7u/u7w7u7u7u7u7u7g2dne7u7u7u7tnu4A7u7g7u/u7u7u4O4A7gDuAO4A7gDuDu7u7u4ODZDu7uAO7unZ3u7u7u7uDu8O/q7u7r7umr7puY/52d7u7v7u7+7u4O4i4O7gLuAinZ2Q7v7+/v' +
  '7g7g7uAO7u7u7+4O4A7g7gAO4ODu4A7gDu4O7g7g7g7u7u7u7u7Z0O7u7g7uDuDu7+7v7u7+7u7u/u7u/+4O7u7gDu7u4K2d7+7g7u7g7u7+7tnZ4A7uDu/u7u7u/ujg7g7g7p2O4O7u2Q7uDu7u7+' +
  '7v7uDu7u7u7u7u7v7u7p2d2e4O7+7v7u7g7uDu7uDu8A7u7u7u2drZ2e7gDuAO4O7u7uD+7u7uDg7u7tm97u4O7g7vDu+dne7u7u7uDuDuDu7g7g7g7uDuDuDuDu7u7u7u4NkO7u7u7u7gne7u7u7g' +
  'Dg7u7u7Z2dDu7u7u2dDu7u7unZ3uDuDu7g7u7u4O7uDu7u6yIO7u7g7uDu7uDu4O4O4O7uAO4A7g7uLuDu7Z2Q7u4ODZ2e4O7u7g7uAODu7u7uDZ2Q7uDuDu2Q7uDuDu2dnu7u7une7u7u7u7tnZ7u' +
  '7u7ujq7u7o7u7u7u7u7g7uDu7u7u/n7u7gDu7u7v7g7g7u4O7u7u7gDv7g7g7u7g7uDu7u4P4ODv7gDuAO4O7u7g7uDu7v7u/u7g7u7u7u7u7u7g7gDuAO7u7u4P7u7g4O7u7g7u7u7+7u7g7uDu7u' +
  'Du7u4P7u7p2d7u7g/u7unZ29jo6Ojo6O7p2Oju7YDu7uDu7u7u7g4NkO7u4O7u7u7u/vnZ3u7u7u7u7u7u7u7u7u7u7u7u7u7p3g7u/u7u6N2eDu4O7u7tnZ4O7v7u7umZ3X7u7u4I0O7u7unQ7u7u' +
  '4O7u4O7u4O7u7g7u7u4A7uDu4ODu7uAA7gDuAO4O57DuDu7nsO4O7ue2vuDu7u4OC2sA7u7gDuDu6ra+7u7u7ie2vu7u7u4gtrDu8O7u62t+7uDmvu7u7u4A7uDmvu4O7u7u7u7g7u4O7g7uDu7g7u' +
  '7uAO4A7g7n0ADu7u4O4iItYgLv/W0P8O7u7g4NbQDu7ufQ7gbQ7u7g7ufW3u7u7gDW3u4A7uDu7uDW3uDu7X7u7g1+AO7u7u7uDuDu4O4OAO7u4O7u7u4A7u7g7u7g7u7u7u4A7u7g7u7u4O7gDutg' +
  '7uDu7uJ+4O7uB97uDW2qrd3d2e7k7u7uPW0H0O7u7u7uQO4O7g7uDuDu7uDuAO4NbX7u7u7n1tDu7urW2q4A7u7uDufQ7uDu4O4NbX7u7ut+4O4A7ube7uDuDu4O7u7g7u7u7u7u7u4A7u4O7u8O7u' +
  '7u59bQ7u7u7uDu4O7u7u4A59bf7u7u7u4O7u7u7g7u7uDuAO4O7W1+7u7u7u7+7vzQEQEhLu7u7u7u7vfX3Z6enu7v7r2dDu3u7u4O4ODu7g4I7u7u7unb3Q3Z3u7u7u7u7u7tnZ6+7unZ0v7u7u7u' +
  '7r7usiL/H/6e7u7N7u7p0ODg7g7+/v7u4O8A7o7u7u4L2d7u7s7v7Zvu7u7u7u7u7u4O7u7v7uvr7u7u7u2e7u7u7u2Q7u7u7u7u7u7u4O/r3u7u7unZ3u7u7u7u7u7u/u7u6dne7u7u7u7tnu7u7u' +
  '/u/Z7g7v7u/u7q3uIu7u/u7+ndnZ7uDu7v7u7tnYIg7u7u7u7u7u7u7u7p2d7u7u7u7u7u7u/u7u7p3u7uD+7u4O7v7u7u7g/u/Z2dnu7u7u7u7u7u7u7u7yIiLuIiDu7u7u7g7u7uvu7u7u7p3uDu' +
  '7u7+7Z7v8O7u7v7u7unQ7uDu7vDu7u7u/u7g7gDuAO4O7g7u4O4ODg4O4ODg7g3t6ODukO7u7uDu4O7uDuDu4O4OAO7uDu7u7u7u7+7v7g7u3Q3d3d3eDuDuDu7g7u7uDuDg7g7u4O1n3W7u7u1tDu' +
  'DuDufW3u7g7u7u7u7uB9bQ7g7u4O4NbX7u7u7u/u7u7u7u7v3dDd393f3d/d0N3f3d/d39bX7u7u7tbX7u7u4K1t7u7u4O7u7v7u1tfg7u4O7q1t7u4O7u7g7m3u7m3vDu7gbe7u4A7g7tvgDuDu7+' +
  '7g2w7u7u7vbd3Q/d3Q3dHdDd0N3Q3dICLuDu4O4O7uAAAiACIi7g7g7g7g7uDu7u7u7u7gAAAt0N3c3Q3e3d293d3u7g7gDuDu4ADQ3dDQ3b3dvd3e3d3g7uDu7u4O7n3Qdnt2et3d3d3d3dAA0NDQ' +
  '3d0A7g7u7uDu4GcnZ4u93dDd3dAN3b3d3d3d3d3QAO4O7g7g7uDu7uDu4O7gDu4ADgAOAA4ADuDW1w7u7g7gDuDd1+7u7u4O7u7u7u4O7g7u4O7g7u4O4O7g7u7gDu7u7u7uANYAZtd9pw3Q3dDd3d' +
  'Db3d3d3d7d7u7gDu7u0N1wd2YAdw7gDuDg7n29273dvd3d3d3d3d0N0ODu7uAO7u7dZv//Dw/QcADM3dC73dBVUP///w8P7u7u7szADAAMDNcMfWbHd3YrIu7u7u4AzMALzLzX3K12bXxi18p37u7u' +
  'Dt3XDuAO4O7u4A7u133XBmeH7u4O4O7u4AwAAABtZtcO4A7gDuAO7t3d3d3d7dDd1w7g7uDuDQcN3e3dBVXdZi/u7uAO7u4O4O7uDu7u7u7dZ2fg7uDu7g7dDd3Qzd3QvdC93b3d0O4O7u7g7uBi7u' +
  '7u7n1tDuDu7t3X7u7gDu7u4A7ufb3bvd293d3d3d3d3Q3QDg7u7u7g7uDuDu7u4O4O4A7g7uDu7g7gDuDuDu4O7u7g7g7u7u7g7uDX1g4O7g7u4O7g7n197u7u7u7u7u7X7u7gDu7u4A7g193Nze3d' +
  '3dC9uw7uDu7u4O4NB90AZgLuDu7u4O7u7u7uDu7ube4O7u7gDu7g7uAO7uAO7n3X7g7gDuAO4O594O4O4O7gDu59Du7u7u7u7g7gDuDu7g7gDuDW4O7ue2vuDu4O4MIrsoWFK5oiIra97g7gDuDu3d' +
  'zt3dsN3dCra+3d3d3d3U7u7u7k1w4O4O4O7u7gDu7u7u4='

export const CLOCKWISE_PATCHED =
  'AgICAgICLwIiAi/g4AIiAi/iLgIvIi8CIgIv4gLiLi9yIi4iLiYiLiIuJuIiLuIiLiYiIiIiJiIuIi4mICIiIiIuLiYg4iDiIi7yLnJicmIiIiIuIi5yYuLiIi4iLiYnIiIiJicCIAIvAi9yYgIvLy' +
  'IiIu4AAHJiIiLyAiACLwIvcmIiIiIiIiYnAAICIgIiL+Iv4gJiDi4iLyIiIi8mJwIuIi8CIuIv4gJiAiICIi/iL+ICYiICIiIvIi9iIi4iLmLi4iIuIi4n4iLg4iIn4iLiIi4u4iLiIuLyICLi8iAi' +
  'AAAA4iDyIiIuLuLi8iAiIvLi8iAi8iAiIiAC4uICICIiIgLi4iACIiICICAiIgIgLiAiIgIgICACAiAiIikCcgIgAiACICImLgIuIiAiIHIuAi4iICICIiIAJgICIiICIiICIuIgJiAuAi4iICIiJi' +
  'CmLgIuIiAiICYgLgIuIiAiICYgAiIiAiLiICYgLgIuAiDiIHJiAiIiIiByYi4CLgIg4iByYgIiAiICIOJyYgIiAiLiIOJiYgLi4i4uIAJiLuIu4iICYi4CLgIg4iDiAmIiIiIiISYnICIiIgICDiYn' +
  '4AIgAiACLi5iAiIiICcgIiIgAi5i4uIgAiIiYuLiAiAiIiAiIgJi4uIgAiACLuLiIAIuLiAiIiACLiAiIiACLuLiIAIiIuAgIPIPIuIi4gIu4iIu4iJyJiAiLiIuJicgIi7yLi4iLuIi4iYnJ+Ii4i' +
  'IiIC4C4uICIiIvIiIiLiIuJnJiIiIiIiYnLgAuAPAvIiLyIiYn4iIu4iIuJ+LiIi4iLuLiIPIiIiIiIgIgICIiAgIgLiAiIuLiAgICIC8AAgIi4gLiIiAgAiACIAIgAiACICIi7iIiIiIuAi/iAiIC' +
  'IOICAiIiICIuLiAmAiICIAIgIiIiAiACICa3JgIgIiIgciIiIi4iLscmAi7iIi7iILcm4uIiIiIiAiIiIAICIiIgAiICIiIgIiAmKwIiAiLyIvIi4iIu4iIuJi0iLuIiLuIgsmIgIiICIuACIAIgAi' +
  'ACIiIiIiIiLgIuIiAiIPIA8iDyIC4uICIiAiICIiIgAi4uICIiIAYnAiACIiIiIiACIAYnAgICIiIiAiICICAuwi6SLOIsYmICIAIg4i/iYuLiIAIiIgYnAiACIAIiIiJiIiIiIiIiIgIgAiACICsr' +
  'ICIiAi4CLiBiLi7i4isCLOIsAisCIiwkIiwiIPICIiEiISAiISAiIiACIGLiIiAiLSIiKiIlIiAiIiIAIgDuAA4iIPIiICIhIgIg4gIiIuLyIgDyLiAgICAAAC4gAiAC4iIsIigCKg8uAi4iLyIvYu' +
  'Ii4iJyjKzLy2Lg7u8gIiLyIi4uLgIuIi8CIuIv4gICIiIvDiIAdwd7Li7iIuIiICIiIPIuLiAgIvICAgLi4iIgLy8CIgIvIgIvAi/icuIiIuIiInLiIuIiIiImIiIiInJiZyAiLvIuAAAAcmJn4iLi' +
  'IiIicmJn4iLyIi4uIiIiIgLyIPIiIiLyAAAAICIiIPIg8i4uAmJnDi4uIuIi4iACYmcuAi4iLyIvLi4vJid2AiIiLyciIi4iIi4nLi4CIuIiIuIvJ3ciIiIi4uIuLuLiIiIuLuLiIiIiIiIi4iDiIi' +
  '4CLuLiIiIuLuICICICIC4iICIiAiICIiICIGICICIgIiAgaSAiIiIgAiACIiIiAiIiIC4iLiImICYqeiAiIgLiIOIiLiIuJidyYicCIi4iLgIiICIiJiciIiACIiICAmKnAgIiIiIiAiIiAiIiIC4u' +
  'IAcuAi4CICIgIiIgDiAO4iLiIi7iIOIiLgIuAgICIiIgIC4uAiACICIiICIiAgIg4uICIAIgAiAgInLudwdwB3B3dw7g4HIiIgIgAiACIAIiIiDiLiAmIHJiIiIO4AIgAiACICIiIiIO4AIgAiDuAC' +
  'IAIgAiAHIiImImJ3YiICAgAgICAgImJycCIiICIAIgImIAAAIiAiICIOAuAi4iICICIAICIiIgAiLi7mdi4uIgAiIiAiAgIgIuAiAiICa3d3JiAiIiIAIiIiAmJwIu4iIu4iCHd7JiICIiAiICYuLi' +
  'IiAiLiIiLgIu4gIgIgIgICAmAiICIiIgIiYgIiIiIi4ucmLiIiLiIiKHd7JifSAiAi4uYgDiAiIiLi7i4iIgIiICdwIgAiAiICIitmcmLgIgIgIg4iYgLgIuIiAiJicgIiACIgImJ+LiIiAiIgIn4u' +
  'IiIi4iDuACIAIgAiDiAiAi4uICAnICAiIiICAmKiIAAiAiInJiLgIuIiAiICYnLrIgIitiAAACICIiAiACLiIsAOIrIisiICIiLi4gIgIvLwICICAiIgICAiIvAgIiICYiIiIuIi4mAiAiIgIgdiAi' +
  'IvIiLvIuAOLiLiIuIiIi4iDyIvIuLiIiIiIuAi4nAiIiAA4vAA8AAAAmLi/iIOIiLgIuJ+IiIuIiImLuICIiIiIiICIg8iLy4gIgIgIiIiACIAIgICIiAiACLi67AgIiIiIiICIiAgIgICAgIiICAu' +
  'LiIAIiIiACIiIC4iLiIiIuIi4gIiIgAiIiIAIiLnIgIgIgLnIgIiICciIiIiACLwIiJiIiAiACICLiIgIgAiAnciIiAiICIOIuci4uAiACIALi4iIiAiICLydycmJnJiDi4gIgAi4ucmIiAiICICIg' +
  'IgICIiIgIGcnIi7iIi7iL3JiAiICIgIg4uJyJy4uAi4CIOIg4uICJy4CLiIgAiLiIOJyJyIgIi4mJwICIgIiAiAicgIgAiACICInAiACICIgJyIiIPIgAiIiIiLiIiLiIiciAiACICIuAi4iIAIiIi' +
  'AiIAIuIi8CIuIv4i4CLiIgAiIiICIg4uIiAi4u4iDiIiIiDiAiLi7gAiAgIiICICICIC4vIgIvIgIv4iIiAiAiIAIiIiACIiICIOIgAgIiIiIgIAIiAiIiLyICIgIi4iDiLi4gAi4iICACAiIiICAu' +
  'Ii7iIuIC4iLyLy4iLiLgAiACICIiAiAiIiIiLgIu4uIiICIiAuLiIiACIiIiIuIi4iICLwIvAi8iIPIiIiIg8i4iAiACLwIv4uIuLiAiAi4CLiIgAiIgAi4iLyIuAi4iL+IuAi4iICLi4i4gIgIuIi' +
  'AgLiAuAiIuIiIvIgIiIiAgIiIiAiACICIiIgIgAiAuLgIgci4CIHJiIgIgAiACICICIAIgAiAiAmInIiICIAIgIiIiIiAiIgICAiACICIiIuIiIgICIiICIAIgIiIiAiACIGcuAi4iICIgIC4CLgIg' +
  'IiAiICAiIiICIAIgAiACICIiAi4iICACIiDiAiAiAgICIiIuLgIgIiIiAiAiIiICIDIDJTJQJQMCUDADIwNSMDBTmpo6qqpZpQU6oDBZowMDKqU1A1mlIiIiIyMjI1JQMDADAwMDMDAwMAMDAwMwMD' +
  'AwAwMDAzAwMDCampqaqqqqqgUFBQUwMDAwAwMDAzU1NTUiIiIiIyMjIzAwMDIDAwMjMDAwMgMDAyMwMDAyAwMDIzAwMDCampqaqqqqqgUFBTAwMDADAwMDNTU1NTI6oCMJoCA6oAMjCaACUDqgAgMJ' +
  'oAJQOqAlCaAgWqAlCaAyWqACOaAqoAiqqgoyMgMgMAozAwMgMAoyAwOiCjIzA6MiCjAyA6MDCjAwA6MDCjAwA6MDCjAwA6MDKjAwAjOjAyIwMDAjAwMDMDAwIwMDAyAwMDAjAwMDIDAwMCIDAwMCID' +
  'AwIgMDAiAwIiKqqqqqMjIyMjAwMDADAwMDMDAwMAMDAwMwMDAwAwMDAzAwMgMDAwIyMjIwMDAwAwMDAzAwMDADAwMDMDAwMAMDAwMwMDAwAwMDAzAwMDADAwMDMDAwMAMDAwMwMDAwAwMDAzAwMDAD' +
  'AwMDMDAwMAMDAwMwMDAwIiIiIqqqqqoyMjIzMDAwMgMDAwMwMDAyAwMDAzAwMDIDAwMDMDAwMgMDAwMyMjIyMDAwMgMDAyMwMDAyAwMDIzAwMDIDAwMjMDAwMgMDAyMwMDAyAwMDIzAwMDIDAwMjMD' +
  'AwMgMDAyMwMDAyAwMDIzAwMDIDAwMjMDAwMiIiIiKSgoKCKQLi4gICAiIiIi8vkpIC4uICLiIuIi8vKSAiIiuSIiIpIiIiIiIiIiIiIiIiIiIuIi4CLikgIiAiIvIiKSniIvIiLvIuKSni4i0CLi4v' +
  'Ly8vkgICAiIiIi8pLi4gAiACICkqLgIuAi8iLyIvDiAC4i3iAikrAiIrkiAgAgICAuICIi8uLgIg4iDi4ikCIiIiLwIiIiku4iIu4iIpIOLiIiIiIpKSAgIiIgIiAiAgIiIg8iIiIC4uIiLiIiLiIA' +
  'KSLgIuIi8iLwLi4uIiLuIiLgKSki4u4iLiIikiIAIiIgLi8iIiLi4CIAIgAiACIAIgAiAiIi4uICApAgIi4CIikpIi4iLiLgAuACDu3iK7IiIuIiIu75KSIiIvIiLyIiICL/4CLg8uD/kpKQIvLy8v' +
  '4gIgIiAC4iLiLyICIAIgIuACICAiIAIgAiIC4gIgIgLiIi7iIi4pIC4iIgIiAiDiL+Li4uLyIiIi8iIu8i4CLiIgAiLiIKKSLyIgIiIgIi7yLikpIAIuAi/iIiIu8iggIgIgLpKCIOLiKQIiAiIiLy' +
  'Iv4iDiIiIu4iIiLvIiLpKSKS4CLyIv4uIgIiAiLgAuAAIiIiIiKSopKeIgAiACIOLiIiDyIiIiAgIiIimyIiICIgIvAi+Ski7iLuIuAiDiAiIgLgIgIiAuAiDiAi4iIi4iICkCLuIiLuIgkiLiIuIg' +
  'AgIi4iIpKSAiIiIiKSDiIuIikpLiAiAiLgIuIiICIiAiLi6+4OLiIgIiAiIiAuICICICLiACIAIgIiIiAiIpKQIiICApKS4CLiIgIiACAiIiIiApKQIiAiDiKQIiAiDiKSki4iLikiLiIiLiIikpIi' +
  '4iLigq4uIoIi4uIiIiIgIuAiIu4i/v4uIgAi4u4vIgLgIiIC4iLiIgAPIgIgLi4gIiAiLiIPICAvIgAiACICLiLgIuAiIv4i/iLgIuLi4iLiIuLgIgAiACLiIiIPIuLgICIuIg4iIiL+LiIgIiAiIi' +
  'AuLiIPIuLpKS4uIg8i4ukpKygoKCgoKC4pKCguIoAuLiAi4iLiIgICkC4uICLiIuIi8vkpIuLiIiIiIiIiIiIiIiIiIiIiIiIpIgIi8iLi6CKSAiICIuLikpICIvIi4ukpmHLi4uIIICIiIikgIiIi' +
  'IC4uIC4uIC4uIgIiLiIOIiAiICAiIi4AIgAiACICJyAiAiInICICIicmIuAi4iICAmIALi4gIuAi6iYi7iLuIicmIu4i7iIgJiAi8CIi4mJ+LiAmIiLiIuIAIiAmLiIOIiIi4iLgIiIOIgIiAiIgIi' +
  'IiACIAIg4nLuAiIiIOLuMCYA7vEmIB8CLiIuICYgAuIicgIgYgIiLgIucmLiLuIgAmLiIAIiAi4uAmIiAi4n4iIgJyACIiIuLiAiAiICICACIiIC4uLiIAIuLgIiIgIiIiIiIAIuLgIiIiICIuDiJg' +
  'IiAiLiJiICIiByIiAmKnrS0tLuLkIi4iMmIHICLuIu4iQCICIgIiAi7iIiAiACICYn4uIiInJiAiIiomKnLgIuIiAicgIiAiICICYnIiIiJyICIAIiYuLiAiAiICIuLgIu4i4iIuLiIAIuICIiACIi' +
  'IiJyYgIu4i7iAi4CIi7iIOJyYvIuIi4iIOLi4uIu4i4iAiACICImJy4iLuIiL+IvwiIgIiIiLuIiLuIvcnIpKSni4vIrKSAu0i7iIOICAiIgIIIiIiIikrIg0pLi4iIuIi4iIikpKy4ukpL/IiIiIi' +
  'IrIivx///wKSIiLNIuLpICAgIgLy8vIgAAAAIo4iLiILKS4iIsIvIpsi4iIuIi4iLiIOIiLvIuLi4iIi4uKeIuIi4uKQIiLuIiIi7iIuIC8rIiLiIukpIi4iIi4iIi4i/i4uKSkiIiIiIiIikiLiIi' +
  '8i8pIgIv4i/i4qIi8SIi8iLykikp4iAiIvIiLikoHwLiIiLiIiIiIi4uLpKS4uIiIi7iIiIu8iIiLpIiIiDyIi4CIvIiIiIg8i8pKSniIiIiIiIiIiLi4uL/8f8i//AiIiIiIgIuIisiIi4iLpIiAi' +
  'IiL+IpLu8CIiIvIuLikgIiAiIvAiIiIi8iIgIgAiACIOIg4iICICAgICICAgIg0tKCAikCLi4uAiICIiAiAiICICACIiAiLi4iIuLyIvIgLuIgIiIiIiAiAiAu4gIuLiAiAgIg4uICJnImIiIiJiAu' +
  'AiDicmLi4gIu4iIu4iByYgIgIiICICYnIuIi4i8iLuIiLuIvIiAiLyIvIi8iICIvIi8iLyYnIiIiIiYnIiIuIKJi4uLiIOIiLvIuJicgIi4CLqJiLi4CLuIg4mIiImIvAiIgYiIiIAIgLisgAiAiLy' +
  'IgKwLiIuIvYiIg8iIgIiEiAiICIgIiIiAiAiICICIiIgIgIAICLgIgIgIg4iDiDiIiIiIgAiAiICIsIgIuIiKyIiIiIgIgAiAi4iAiIuIADrIisiIuIiIgIiAiIi4CLnfAJit3JyIi0tIiItIgIiIg' +
  'IiIgLgIuIiAiIHcmdiuyIiAiIiACIrIiIrIiIiIgDiICIgIgIiAiIiAiICIgAiLgAiACIAIgAiAmJwIiIgIgAiAmJyIiIiLuIi4iLg4ADgIiICIgIiICIOIg4iIgAi4iLiIuwCYgdtZyqgIgIiAiIi' +
  'ArIiIiIi4iIiIgAi4ucCYgdnZwcgIgAiAgInKyK7IisiLSIiIiIiICICAiIiACLi4mdg8PAABwIGDCIgCyIiAiIA8AAAAAIi4iLgzMALAAAHcAcmJ3Zya7giIiIiILuwC7sLB30KpyYnBnZ3onIiIi' +
  'ACYnAiACICIiIAIudyYndneC4uICICIiIMwMBwJiZycCIAIgAiACIiIiIiIi4iAiJwIgIiAiBwIAIuIiAiViZ//i4iACIiICICIiAiIiIiJ3JnYgIiAiIgIiAiIgwiIgsiCyIrIiIC4CLiIgIiByIi' +
  '4iLnJiAiAiIiYn4uIgAiIiIAIucrIrsiKyItIiIiIiIgIgAgIiIiIgIiAiAiLiIOICIAIgIiAiIgIgAiAiAiICIuIg4gIu4iIg4iAnJgICIgIiIOIg4nJy4iLiIiIiLi4n4uIgAiIiIAIgJ9LCwuIi' +
  'IiB3ewIiAiLiIOIHBicGdgAiAiLiIOLi4iIuAiIuYi4CLiIgAiIgIiACIiACLnInIgIgAiACICJyICICICIgAi5yAuIuIi4iIgIgAiAiIgIgAiAmICIicmIiAiICIMu7u8XFu8rMzCYtIgIgAiAiIi' +
  'ziIisCIiCiYuIiIiIiIkLiLi4kJwICICIC4uIgAiIiLi4='
