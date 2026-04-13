import segmenter from "./internal/segmenter";
import { computeAtomRoles, decomposeToAtoms } from "./internal/utils";
import type { Query, QueryGrapheme, QueryOptions } from "./types";

const DEFAULT_OPTIONS: QueryOptions = {
    caseSensitive: false,
};

export function buildQuery(input: string, options: QueryOptions = DEFAULT_OPTIONS): Query {
    options = { ...DEFAULT_OPTIONS, ...options };

    // literal 조건: 앞뒤 모두 " 로 감싸져 있는 경우만
    const isLiteral = input.length >= 2 && input.startsWith('"') && input.endsWith('"');

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

    if (!options.caseSensitive) {
        cleaned = cleaned.toLowerCase();
    }

    if (cleaned === "") {
        return {
            input,
            graphemes: [],
            literal: null,
        };
    }

    const graphemes: QueryGrapheme[] = [];

    for (const seg of segmenter.segment(cleaned)) {
        const rawGrapheme = seg.segment;
        const atoms = decomposeToAtoms(rawGrapheme);
        const { vowelIndex, tailIndex } = computeAtomRoles(atoms);

        graphemes.push({
            char: rawGrapheme,
            atoms,
            vowelIndex,
            tailIndex,
        });
    }

    return {
        input,
        graphemes,
        literal: null,
    };
}
