import type { FuzzyQuery, FuzzyChar } from "./types";
import { decomposeToStrokes, isVowel } from "./internal/utils";
import segmenter from "./internal/segmenter";

export function buildFuzzyQuery(input: string): FuzzyQuery | null {
    // literal 조건: 앞뒤 모두 " 로 감싸져 있는 경우만
    const isLiteral =
        input.length >= 2 &&
        input.startsWith("\"") &&
        input.endsWith("\"");

    // Literal 처리
    if (isLiteral) {
        const inner = input.slice(1, -1);
        return {
            text: inner,
            chars: [],
            isLiteral: true,
        };
    }

    // literal이 아닌 경우: 모든 따옴표 제거
    // 이건 고민을 좀 해봐야함. '"'를 검색을 하고 싶을 수도 있다.
    const cleaned = input.replace(/"/g, "");
    if (cleaned === "") {
        return null;
    }

    const chars: FuzzyChar[] = [];

    // grapheme 단위로 이동
    for (const seg of segmenter.segment(cleaned)) {
        const cluster = seg.segment;
        const strokes = decomposeToStrokes(cluster);

        // vowelIndex, tailIndex 계산
        let vowelIndex = -1;
        let tailIndex = -1;

        for (let i = 0; i < strokes.length; i++) {
            const s = strokes[i];
            const v = isVowel(s);

            if (vowelIndex === -1) {
                if (v) vowelIndex = i;
            } else {
                if (!v) {
                    tailIndex = i;
                    break;
                }
            }
        }

        chars.push({
            char: cluster,
            strokes,
            vowelIndex,
            tailIndex,
            allowTailSpillover: false, // 임시로 false로 설정. 호출하는 쪽에서 마지막 쿼리의 마지막 char에 대해 true로 설정할 것.
        });
    }

    return {
        text: cleaned,
        chars,
        isLiteral: false,
    };
}
