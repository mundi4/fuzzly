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
 * `opts.whitespace` 동작 (기본값 `"ignore"`):
 * - `"preserve"`: 공백을 일반 atom으로 취급 (`"ab cd"`는 target에 literal 공백이 있어야 매치).
 * - `"ignore"`: 공백 grapheme을 제거 후 매칭 (`"ab cd"` ≡ `"abcd"`).
 * - `"split"`: 공백 boundary로 sub-query를 분리해 순서 무관 AND 매칭.
 *   동일 토큰 또는 다른 토큰의 atom-prefix인 토큰은 redundant로 제거된다.
 *   예: `"안녕 안"` → `["안녕"]`, `"a ab"` → `["ab"]`, `"ㅇㄴ 안녕"` → `["안녕"]`.
 *   결과 outer Query는 `graphemes: []`, `atoms: ""`이며 `subQueries`에 dedup된 sub Query들이 담긴다.
 *
 * **제약**: 입력이 65535 UTF-16 코드유닛을 초과하면 `RangeError`.
 *
 * @param input - 사용자의 검색 입력 (한글 초성, 부분 조합, 영문 등 모두 허용)
 * @param opts - 빌드 옵션. `whitespace` 기본값은 `"ignore"`
 * @returns 분해된 Query 객체
 */
export function buildQuery(input: string, opts?: { whitespace?: WhitespaceMode }): Query {
    if (input.length > 0xffff) {
        throw new RangeError(`buildQuery: input length ${input.length} exceeds Uint16Array limit (65535)`);
    }

    const whitespace: WhitespaceMode = opts?.whitespace ?? "ignore";

    if (whitespace === "split") {
        return buildSplitQuery(input);
    }

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

/**
 * `whitespace: "split"` 분기 구현.
 *
 * 1. `/\s+/` boundary로 토큰화 (탭/개행 포함, 양 끝 trim, 빈 토큰 제거).
 * 2. 각 토큰을 `whitespace: "ignore"`로 sub-Query 빌드.
 * 3. **atom-prefix dedup**: AND 조건이므로 다른 토큰의 atom-prefix인 토큰은 매치 시
 *    자동 만족되어 redundant. 짧은 atom-prefix를 제거하고 긴 superstring을 유지한다.
 *    insertion order는 보존하지 않는다 — sort 비교를 위해 길이 내림차순으로 처리.
 */
function buildSplitQuery(input: string): Query {
    const trimmed = input.trim();
    if (trimmed === "") {
        return { input, graphemes: [], atoms: "", whitespace: "split" };
    }

    const tokensRaw = trimmed.split(/\s+/);
    const subsRaw: Query[] = tokensRaw.map((t) => buildQuery(t, { whitespace: "ignore" }));

    // 빈 sub (예: 공백만 있는 토큰)는 토큰화 단계에서 이미 걸러지므로 atoms === "" 인 sub는 일반적으로 없으나,
    // 방어적으로 제외한다.
    const nonEmpty = subsRaw.filter((s) => s.atoms.length > 0);
    if (nonEmpty.length === 0) {
        return { input, graphemes: [], atoms: "", whitespace: "split" };
    }

    // atoms.length 내림차순으로 정렬한 뒤 prefix dedup.
    // 이미 keep된 sub의 atoms가 자기 atoms로 시작하면 자기는 redundant (자기가 keep된 sub의 prefix).
    // 자기가 keep된 sub의 atoms로 시작하면 자기는 keep된 sub의 superstring (이 경우 자기를 유지).
    // 길이 내림차순 처리 시 keep된 sub들은 항상 자기보다 길거나 같으므로 후자(자기가 keep의 prefix)만 검사.
    const sorted = [...nonEmpty].sort((a, b) => b.atoms.length - a.atoms.length);
    const kept: Query[] = [];
    for (const sub of sorted) {
        let redundant = false;
        for (const k of kept) {
            // kept[k].atoms 는 sub.atoms 보다 길거나 같다.
            // sub.atoms 가 kept[k].atoms 의 prefix 이면 sub 는 redundant.
            // 동일 길이일 땐 startsWith 가 곧 equality 이므로 같은 처리.
            if (k.atoms.startsWith(sub.atoms)) {
                redundant = true;
                break;
            }
        }
        if (!redundant) kept.push(sub);
    }

    return {
        input,
        graphemes: [],
        atoms: "",
        whitespace: "split",
        subQueries: kept,
    };
}
