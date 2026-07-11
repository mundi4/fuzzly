import { DASH_ID, DOT_ID, SPACE_CHAR_CODE, SPACE_ID, UNDERSCORE_ID } from "./internal/atomRegistry";
import { eachGrapheme } from "./internal/segmenter";
import { computeAtomRoles, decomposeToAtoms, foldCase } from "./internal/utils";
import type { Atoms, Target, TargetWhitespaceMode } from "./types";

/**
 * `Target` 영속화(직렬화) 포맷 버전.
 *
 * `Target`은 `structuredClone`/IndexedDB에 직접 저장하고 다른 세션에서 그대로
 * hydrate할 수 있다. atom ID는 순수함수 산출이라 값 자체는 안정적이지만,
 * fuzzly 업그레이드로 **Target 필드 구성이나 atom 인코딩 구조**가 바뀌면
 * 저장된 Target이 조용히 호환 불가가 된다. 이 상수는 그 무효화 계약을 명시한다:
 * 구조가 바뀌면 bump한다.
 *
 * **소비 계약**: 이 값을 **캐시 행마다** 적을 필요는 없다. 소비자는 스토어 단위로
 * 한 번만 기록해두고(예: IndexedDB의 meta 레코드 하나), 로드 시 불일치하면
 * 저장된 Target 전체를 재전처리한다. 무효화 판단 주체는 소비자이며, fuzzly는
 * 이 버전 값만 노출한다. 같은 버전 안에서 두 공백 모드(`keep`/`transparent`)가
 * 공존하므로 **모드 식별은 버전이 아니라 `Target.whitespace` 필드**로 한다.
 *
 * 이력: v3 — `Target.whitespace` 필드 추가 + `preprocessTarget`의 `transparent` 모드 도입.
 * v2 — normalizedInput 산출이 `toLowerCase()`에서 길이보존·문맥무관 `foldCase`로
 * 변경 (İ 원문 유지, Σ/ς 통일). v1 시절 직렬화된 Target 은 좌표계·atom 인코딩이 다르다.
 */
export const PREPROCESS_VERSION = 3;

/**
 * 검색 대상 문자열을 grapheme 단위로 분해하고 flat typed array 레이아웃으로 저장한다.
 * 결과 Target 객체는 한 번 생성해두고 여러 쿼리에 대해 재사용하는 것이 의도된 패턴.
 *
 * 반환된 `Target`은 모든 필드가 `string | number | TypedArray`이고
 * atom ID가 순수함수로 산출되므로(자모/ASCII 고정 + 그 외는 codepoint 그대로)
 * `structuredClone` / IndexedDB에 직접 저장하고 어떤 세션에서든 그대로 로드 가능하다.
 * 영속화 시 무효화 판단은 {@link PREPROCESS_VERSION} 상수로 한다 (스토어 단위 1회 기록).
 *
 * **`opts.whitespace`** (기본 `"keep"`):
 * - `"keep"`: 공백을 독립 grapheme으로 방출 (기존 동작).
 * - `"transparent"`: **U+0020 공백만** grapheme으로 방출하지 않는다 — 쿼리 축 기본값
 *   `whitespace: "ignore"`가 제거하는 것(단일 U+0020 grapheme)과 정확히 대칭.
 *   공백 낀 near-exact 매치가 연속 run으로 인정된다. 스킵된 공백 다음 grapheme은
 *   단어 경계로 표시되고, 공백의 UTF-16 위치는 `graphemeIndexes`에서 다음에 방출된
 *   grapheme으로 매핑된다 (꼬리 공백은 마지막 grapheme으로 클램프).
 *   **`graphemeCount`가 공백을 세지 않으므로** `targetLengthPenalty × T`에서 공백이
 *   빠진다 (의도된 시맨틱). 공백 포함 `whitespace: "preserve"` 쿼리와는 비호환 —
 *   타겟에 공백 grapheme이 없어 구조적으로 매치 불가 (dev 모드 경고).
 *
 * **제약**: 입력이 65535 UTF-16 코드유닛을 초과하면 `RangeError` (공백 포함 원문 길이 기준).
 * 커맨드팔레트 용도에서는 도달할 수 없는 한계.
 *
 * @param input - 검색 대상 원문 문자열
 * @param opts - 전처리 옵션. `whitespace` 기본값은 `"keep"`
 * @returns 전처리된 Target 객체 (`match`, `matchBest`의 두 번째 인자로 사용)
 */
export function preprocessTarget(input: string, opts?: { whitespace?: TargetWhitespaceMode }): Target {
    if (input.length > 0xffff) {
        throw new RangeError(`preprocessTarget: input length ${input.length} exceeds Uint16Array limit (65535)`);
    }

    const whitespace: TargetWhitespaceMode = opts?.whitespace ?? "keep";
    const transparent = whitespace === "transparent";

    // 길이 보존 folding (buildQuery/matchLiteral 과 동일 함수) — normalizedInput 의
    // UTF-16 offset 이 원문 input 과 1:1 이어야 charIndexes/하이라이트 좌표계가 유지된다.
    const normalizedInput = foldCase(input);

    // Pass 1: temp JS arrays에 수집
    const tmpAtomArrays: Atoms[] = [];
    const tmpCharIndexes: number[] = [];
    const tmpGraphemeIndexes: number[] = []; // sparse — normalizedInput 길이만큼
    let graphemeIndex = 0;
    // transparent: 아직 다음 grapheme이 방출되지 않은 공백 run의 시작 UTF-16 위치 (-1 = 없음).
    // 방출 grapheme들이 원문을 틈 없이 타일링하므로 run의 끝은 항상 다음 방출 cluster의
    // startIndex(또는 입력 끝) — 시작 위치 하나만 기억하면 된다.
    let pendingSpaceStart = -1;

    eachGrapheme(normalizedInput, (cluster, startIndex) => {
        // decomposeToAtoms는 모든 grapheme cluster를 처리:
        // - BMP 1-char: 한글 분해 or 단일 atom ID
        // - non-BMP (surrogate pair) or multi-codepoint: cluster 전체에 동적 ID 할당
        const atoms = decomposeToAtoms(cluster);

        // transparent: 단일 atom U+0020 grapheme은 방출하지 않는다 — buildQuery의
        // "ignore" 드롭 조건(buildQuery.ts)과 동일 판별식. 한쪽만 바꾸면 쿼리/타겟 공백
        // 대칭이 깨진다. 위치는 pending에 쌓아 다음 방출 grapheme에 매핑.
        if (transparent && atoms.length === 1 && atoms[0] === SPACE_ID) {
            if (pendingSpaceStart < 0) pendingSpaceStart = startIndex;
            return;
        }

        tmpCharIndexes[graphemeIndex] = startIndex;

        // graphemeIndexes: cluster 내 모든 UTF-16 위치를 같은 grapheme index로 매핑
        for (let i = 0; i < cluster.length; i++) {
            tmpGraphemeIndexes[startIndex + i] = graphemeIndex;
        }

        if (pendingSpaceStart >= 0) {
            // 스킵한 공백 위치는 다음에 방출되는 grapheme(=이번)의 인덱스로 매핑 —
            // 미기록 시 dense 변환의 `?? 0`이 모든 공백을 grapheme 0으로 보내
            // matchLiteral/createGraphemeBonuses가 조용히 오염된다.
            for (let p = pendingSpaceStart; p < startIndex; p++) {
                tmpGraphemeIndexes[p] = graphemeIndex;
            }
            pendingSpaceStart = -1;
        }

        tmpAtomArrays[graphemeIndex] = atoms;
        graphemeIndex++;
    });

    const graphemeCount = graphemeIndex;

    // 꼬리 공백: 뒤에 방출 grapheme이 없으므로 마지막 grapheme으로 클램프.
    // 전량 공백 입력(graphemeCount === 0)은 dense 변환의 `?? 0`이 0으로 채운다.
    if (pendingSpaceStart >= 0 && graphemeCount > 0) {
        for (let p = pendingSpaceStart; p < normalizedInput.length; p++) {
            tmpGraphemeIndexes[p] = graphemeCount - 1;
        }
    }

    // Pass 2: flat typed arrays 구축
    let totalAtoms = 0;
    for (let i = 0; i < graphemeCount; i++) {
        totalAtoms += tmpAtomArrays[i].length;
    }

    const atomsFlat = new Uint16Array(totalAtoms);
    const atomStarts = new Uint32Array(graphemeCount);
    const atomLens = new Uint8Array(graphemeCount);
    const vowelIdxs = new Int8Array(graphemeCount);
    const tailIdxs = new Int8Array(graphemeCount);
    const boundaryFlags = new Uint8Array(graphemeCount);

    let atomOffset = 0;
    for (let i = 0; i < graphemeCount; i++) {
        const atoms = tmpAtomArrays[i];
        // atomLens 는 Uint8Array — 255 초과 시 silent wrap 으로 오매칭이 생기므로 명시적으로 실패.
        // 정상 텍스트에선 도달 불가 (결합문자 255개 초과 단일 grapheme 같은 적대적 입력 한정).
        if (atoms.length > 0xff) {
            throw new RangeError(`preprocessTarget: grapheme at index ${i} has ${atoms.length} atoms (max 255)`);
        }
        atomStarts[i] = atomOffset;
        atomLens[i] = atoms.length;
        atomsFlat.set(atoms, atomOffset);

        const { vowelIndex, tailIndex } = computeAtomRoles(atoms);
        vowelIdxs[i] = vowelIndex;
        tailIdxs[i] = tailIndex;

        // boundary 판별: 첫 grapheme이거나 직전 *방출* grapheme이 공백/밑줄/대시/점.
        // transparent 모드에선 공백이 방출되지 않으므로 "직전 원문 문자가 U+0020"으로
        // 스킵된 공백 경계를 판별한다 — 방출된 cluster는 U+0020으로 끝날 수 없어
        // (공백은 앞 cluster에 붙지 않음) 이 문자는 항상 스킵된 공백이다.
        if (i === 0) {
            boundaryFlags[i] = 1;
        } else if (transparent && normalizedInput.charCodeAt(tmpCharIndexes[i] - 1) === SPACE_CHAR_CODE) {
            boundaryFlags[i] = 1;
        } else {
            const prev = tmpAtomArrays[i - 1];
            if (prev.length === 1) {
                const pid = prev[0];
                if (pid === SPACE_ID || pid === UNDERSCORE_ID || pid === DASH_ID || pid === DOT_ID) {
                    boundaryFlags[i] = 1;
                }
            }
        }

        atomOffset += atoms.length;
    }

    // charIndexes → Uint16Array
    const charIndexes = new Uint16Array(graphemeCount);
    for (let i = 0; i < graphemeCount; i++) {
        charIndexes[i] = tmpCharIndexes[i];
    }

    // graphemeIndexes → Uint16Array (sparse array → dense)
    const graphemeIndexes = new Uint16Array(normalizedInput.length);
    for (let i = 0; i < normalizedInput.length; i++) {
        graphemeIndexes[i] = tmpGraphemeIndexes[i] ?? 0;
    }

    return {
        input,
        normalizedInput,
        whitespace,
        graphemeCount,
        atomsFlat,
        atomStarts,
        atomLens,
        vowelIdxs,
        tailIdxs,
        boundaryFlags,
        graphemeIndexes,
        charIndexes,
    };
}
