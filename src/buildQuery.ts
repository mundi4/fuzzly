import { atomIdToChar, SPACE_ID } from "./internal/atomRegistry";
import segmenter from "./internal/segmenter";
import { computeAtomRoles, decomposeToAtoms } from "./internal/utils";
import type { Query, QueryGrapheme, WhitespaceMode } from "./types";

function normalizeForMatch(input: string): string {
    return input.replace(/[A-Z]/g, (char) => char.toLowerCase());
}

/**
 * 사용자 입력 문자열을 grapheme 단위로 분해하여 Query 객체를 생성한다.
 * 대문자는 소문자로 정규화된다.
 *
 * `opts.whitespace = "ignore"`로 지정하면 쿼리에서 공백(ASCII 0x20) grapheme을 제거한다.
 *
 * **제약**: 입력이 65535 UTF-16 코드유닛을 초과하면 `RangeError`.
 *
 * @param input - 사용자의 검색 입력 (한글 초성, 부분 조합, 영문 등 모두 허용)
 * @param opts - 빌드 옵션. `whitespace` 기본값은 `"literal"` (공백을 일반 atom으로 유지)
 * @returns 분해된 Query 객체
 */
export function buildQuery(input: string, opts?: { whitespace?: WhitespaceMode }): Query {
    if (input.length > 0xffff) {
        throw new RangeError(`buildQuery: input length ${input.length} exceeds Uint16Array limit (65535)`);
    }

    const whitespace: WhitespaceMode = opts?.whitespace ?? "literal";
    const cleaned = normalizeForMatch(input);

    if (cleaned === "") {
        return {
            input,
            graphemes: [],
            atoms: "",
            whitespace,
        };
    }

    const graphemes: QueryGrapheme[] = [];

    for (const seg of segmenter.segment(cleaned)) {
        const rawGrapheme = seg.segment;
        const atoms = decomposeToAtoms(rawGrapheme);

        if (whitespace === "ignore" && atoms.length === 1 && atoms[0] === SPACE_ID) {
            continue;
        }

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
        whitespace,
    };
}
