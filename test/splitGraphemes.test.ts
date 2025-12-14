// import { splitGraphemesFallback } from "../src/internal/splitGraphemes.fallback";
// import { splitGraphemesSegmenter } from "../src/internal/splitGraphemes.segmenter";

// // 3자 비교: expected vs fallback vs segmenter
// function expectAll(str: string, expected: string[]) {
//     const f = splitGraphemesFallback(str);
//     const s = splitGraphemesSegmenter(str);

//     expect(f).toEqual(expected);
//     expect(s).toEqual(expected);
//     expect(f).toEqual(s);
// }

// describe("Grapheme splitting (fallback vs segmenter vs expected)", () => {

//     it("ASCII", () => {
//         expectAll("abc", ["a", "b", "c"]);
//     });

//     it("combining mark", () => {
//         expectAll("a\u0301", ["a\u0301"]);
//     });

//     it("Hangul syllables", () => {
//         expectAll("값어치", ["값", "어", "치"]);
//     });

//     it("emoji + skin tone", () => {
//         expectAll("👍🏽🙂", ["👍🏽", "🙂"]);
//     });

//     it("ZWJ family emoji", () => {
//         expectAll("👩‍👩‍👦", ["👩‍👩‍👦"]);
//     });

//     it("regional indicator flags", () => {
//         expectAll("🇰🇷", ["🇰🇷"]);
//     });

//     it("multiple flags", () => {
//         expectAll("🇰🇷🇯🇵🇺🇸", ["🇰🇷", "🇯🇵", "🇺🇸"]);
//     });

//     it("mixed Hangul + emoji", () => {
//         expectAll("가👍나🙂다", ["가", "👍", "나", "🙂", "다"]);
//     });

//     it("ZWJ + modifier", () => {
//         expectAll("👨🏽‍💻", ["👨🏽‍💻"]);
//     });

//     it("complex multi-ZWJ, multi-modifier sequence", () => {
//         expectAll("👩🏿‍❤️‍👩🏻", ["👩🏿‍❤️‍👩🏻"]);
//     });

//     it("long mixed string", () => {
//         expectAll(
//             "Hello🙂값👍🏽👨‍👩‍👧‍👦abc🇰🇷",
//             [
//                 "H", "e", "l", "l", "o",
//                 "🙂",
//                 "값",
//                 "👍🏽",
//                 "👨‍👩‍👧‍👦",
//                 "a", "b", "c",
//                 "🇰🇷"
//             ]
//         );
//     });
// });
