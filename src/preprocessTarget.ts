import { DASH_ID, DOT_ID, SPACE_ID, UNDERSCORE_ID } from "./internal/atomRegistry";
import { eachGrapheme } from "./internal/segmenter";
import { computeAtomRoles, decomposeToAtoms, foldCase } from "./internal/utils";
import type { Atoms, Target } from "./types";

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
 * 이 버전 값만 노출한다.
 */
export const PREPROCESS_VERSION = 1;

/**
 * 검색 대상 문자열을 grapheme 단위로 분해하고 flat typed array 레이아웃으로 저장한다.
 * 결과 Target 객체는 한 번 생성해두고 여러 쿼리에 대해 재사용하는 것이 의도된 패턴.
 *
 * 반환된 `Target`은 모든 필드가 `string | number | TypedArray`이고
 * atom ID가 순수함수로 산출되므로(자모/ASCII 고정 + 그 외는 codepoint 그대로)
 * `structuredClone` / IndexedDB에 직접 저장하고 어떤 세션에서든 그대로 로드 가능하다.
 * 영속화 시 무효화 판단은 {@link PREPROCESS_VERSION} 상수로 한다 (스토어 단위 1회 기록).
 *
 * **제약**: 입력이 65535 UTF-16 코드유닛을 초과하면 `RangeError`.
 * 커맨드팔레트 용도에서는 도달할 수 없는 한계.
 *
 * @param input - 검색 대상 원문 문자열
 * @returns 전처리된 Target 객체 (`match`, `matchBest`의 두 번째 인자로 사용)
 */
export function preprocessTarget(input: string): Target {
    if (input.length > 0xffff) {
        throw new RangeError(`preprocessTarget: input length ${input.length} exceeds Uint16Array limit (65535)`);
    }

    // 길이 보존 folding (buildQuery/matchLiteral 과 동일 함수) — normalizedInput 의
    // UTF-16 offset 이 원문 input 과 1:1 이어야 charIndexes/하이라이트 좌표계가 유지된다.
    const normalizedInput = foldCase(input);

    // Pass 1: temp JS arrays에 수집
    const tmpAtomArrays: Atoms[] = [];
    const tmpCharIndexes: number[] = [];
    const tmpGraphemeIndexes: number[] = []; // sparse — normalizedInput 길이만큼
    let graphemeIndex = 0;

    eachGrapheme(normalizedInput, (cluster, startIndex) => {
        tmpCharIndexes[graphemeIndex] = startIndex;

        // decomposeToAtoms는 모든 grapheme cluster를 처리:
        // - BMP 1-char: 한글 분해 or 단일 atom ID
        // - non-BMP (surrogate pair) or multi-codepoint: cluster 전체에 동적 ID 할당
        const atoms = decomposeToAtoms(cluster);

        // graphemeIndexes: cluster 내 모든 UTF-16 위치를 같은 grapheme index로 매핑
        for (let i = 0; i < cluster.length; i++) {
            tmpGraphemeIndexes[startIndex + i] = graphemeIndex;
        }

        tmpAtomArrays[graphemeIndex] = atoms;
        graphemeIndex++;
    });

    const graphemeCount = graphemeIndex;

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

        // boundary 판별: 첫 grapheme이거나 이전이 공백/밑줄/대시/점
        if (i === 0) {
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
