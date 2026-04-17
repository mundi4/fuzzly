import { atomIdToChar } from "./internal/atomRegistry";
import segmenter from "./internal/segmenter";
import { computeAtomRoles, decomposeToAtoms } from "./internal/utils";
import type { Query, QueryGrapheme } from "./types";

function normalizeForMatch(input: string): string {
    return input.replace(/[A-Z]/g, (char) => char.toLowerCase());
}

/**
 * 사용자 입력 문자열을 grapheme 단위로 분해하여 Query 객체를 생성한다.
 * 대문자는 소문자로 정규화된다.
 *
 * @param input - 사용자의 검색 입력 (한글 초성, 부분 조합, 영문 등 모두 허용)
 * @returns 분해된 Query 객체
 */
export function buildQuery(input: string): Query {
    const cleaned = normalizeForMatch(input);

    if (cleaned === "") {
        return {
            input,
            graphemes: [],
            atoms: "",
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

    // session prefix check용 문자열 (createSearcher에서 사용)
    let atomsStr = "";
    for (const g of graphemes) {
        for (let i = 0; i < g.atoms.length; i++) {
            atomsStr += atomIdToChar(g.atoms[i]);
        }
    }

    return {
        input,
        graphemes,
        atoms: atomsStr,
    };
}
