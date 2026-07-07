const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });

export default segmenter;

// "1 code unit = 1 grapheme"이 보장되는 안전 문자 집합:
// - ASCII printable (0x20-0x7E)
// - 완성형 한글 음절 (U+AC00-D7A3) — 뒤에 conjoining jamo(U+1100-11FF)가 오면
//   클러스터가 되지만, conjoining jamo는 이 집합 밖이라 전체 검사에서 걸러진다
// - 호환 자모 (U+3131-318E) — conjoining 하지 않음
// 결합문자/서로게이트/ZWJ/제어문자는 전부 집합 밖 → Intl.Segmenter 폴백.
function isFastSegmentable(input: string): boolean {
    for (let i = 0; i < input.length; i++) {
        const c = input.charCodeAt(i);
        if (!((c >= 0x20 && c <= 0x7e) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0x3131 && c <= 0x318e))) {
            return false;
        }
    }
    return true;
}

/**
 * grapheme 순회 — 커맨드팔레트 텍스트 대부분(ASCII/완성 한글/호환 자모)은
 * code-unit 루프로 처리해 `Intl.Segmenter` 비용(전처리 시간의 ~75%)을 우회한다.
 * 안전 집합 밖 문자가 하나라도 있으면 Segmenter로 폴백 (동작 동일).
 */
export function eachGrapheme(input: string, cb: (segment: string, index: number) => void): void {
    if (isFastSegmentable(input)) {
        for (let i = 0; i < input.length; i++) {
            cb(input[i], i);
        }
        return;
    }
    for (const seg of segmenter.segment(input)) {
        cb(seg.segment, seg.index);
    }
}
