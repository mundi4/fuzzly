// // ZWJ
// const ZWJ = 0x200D;

// // Regional Indicator
// function isRegionalIndicator(cp: number): boolean {
//     return cp >= 0x1F1E6 && cp <= 0x1F1FF;
// }

// function isModifierOrVS(cp: number): boolean {
//     // Combining Diacritical Marks
//     if (cp >= 0x0300 && cp <= 0x036F) return true;
//     if (cp >= 0x1AB0 && cp <= 0x1AFF) return true;
//     if (cp >= 0x1DC0 && cp <= 0x1DFF) return true;
//     if (cp >= 0x20D0 && cp <= 0x20FF) return true;
//     if (cp >= 0xFE20 && cp <= 0xFE2F) return true;

//     // Variation Selectors + Supplement
//     if (cp >= 0xFE00 && cp <= 0xFE0F) return true;
//     if (cp >= 0xE0100 && cp <= 0xE01EF) return true;

//     // Skin tone modifier
//     if (cp >= 0x1F3FB && cp <= 0x1F3FF) return true;

//     if (cp === ZWJ) return true;

//     return false;
// }

// // cluster가 ZWJ로 끝나는지
// function endsWithZWJ(cluster: string): boolean {
//     const last = [...cluster].pop();
//     return last?.codePointAt(0) === ZWJ;
// }

// // cluster 끝쪽 regional indicator 개수 세기
// function trailingRIcount(cluster: string): number {
//     let count = 0;
//     const cps = [...cluster].map(c => c.codePointAt(0)!);
//     for (let i = cps.length - 1; i >= 0; i--) {
//         if (isRegionalIndicator(cps[i])) count++;
//         else break;
//     }
//     return count;
// }

// export function splitGraphemesFallback(str: string): string[] {
//     const chars = [...str];
//     const result: string[] = [];
//     let current = "";

//     for (const ch of chars) {
//         const cp = ch.codePointAt(0)!;

//         if (!current) {
//             current = ch;
//             continue;
//         }

//         const joinBecauseModifier =
//             isModifierOrVS(cp) || endsWithZWJ(current);

//         // Regional Indicator 페어 처리
//         const currentRICount = trailingRIcount(current);
//         const joinRI =
//             isRegionalIndicator(cp) &&
//             (currentRICount % 2 === 1); // 홀수 개 → 다음 RI를 붙여야 함

//         const shouldJoin = joinBecauseModifier || joinRI;

//         if (shouldJoin) {
//             current += ch;
//         } else {
//             result.push(current);
//             current = ch;
//         }
//     }

//     if (current) result.push(current);

//     return result;
// }
