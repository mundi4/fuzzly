import type { QueryOptions, Query, QueryGrapheme } from "./types";
import { decomposeToAtoms, isVowel } from "./internal/utils";
import segmenter from "./internal/segmenter";

const DEFAULT_OPTIONS: QueryOptions = {
    caseSensitive: false,
};

export function buildQuery(input: string, options: QueryOptions = DEFAULT_OPTIONS): Query {
    options = { ...DEFAULT_OPTIONS, ...options };

    // literal 조건: 앞뒤 모두 " 로 감싸져 있는 경우만
    const isLiteral =
        input.length >= 2 &&
        input.startsWith("\"") &&
        input.endsWith("\"");

    // Literal 처리
    if (isLiteral) {
        const inner = input.slice(1, -1);
        return {
            input,
            literal: !options.caseSensitive ? inner.toLowerCase() : inner,
            graphemes: [],
        };
    }

    // literal이 아닌 경우: 모든 따옴표 제거
    // 이건 고민을 좀 해봐야함. '"'를 검색을 하고 싶을 수도 있다.
    let cleaned = input.replace(/"/g, "");

    // caseSensitive 옵션 적용
    if (!options.caseSensitive) {
        cleaned = cleaned.toLowerCase();
    }

    if (cleaned === "") {
        return {
            input: input,
            graphemes: [],
            literal: null,
        };
    }

    const graphemes: QueryGrapheme[] = [];

    // grapheme 단위로 이동
    for (const seg of segmenter.segment(cleaned)) {
        const rawGrapheme = seg.segment;
        const atoms = decomposeToAtoms(rawGrapheme);

        // vowelIndex, tailIndex 계산
        let vowelIndex = -1;
        let tailIndex = -1;

        for (let i = 0; i < atoms.length; i++) {
            const s = atoms[i];
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

        graphemes.push({
            char: rawGrapheme,
            atoms,
            vowelIndex,
            tailIndex,
            allowTailSpillover: false,
        });
    }

    return {
        input,
        graphemes,
        literal: null,
    };
}
