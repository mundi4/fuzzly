import type { FuzzyStrokes, FuzzyQuery, StrokeMatchMap } from "./types";

// 30분 후에 보면 잊어버릴 코드
// 조건이 복잡하고 지금 조건들이 현실을 제대로 커버하는지, 어떤 엣지케이스들을 간과했는지... 분석을 더 해봐야 함.
export function matchFuzzyStrokes(query: FuzzyQuery, parts: FuzzyStrokes[]): StrokeMatchMap | null {
    if (query.isLiteral) {
        return null;
    }

    const querySyllables = query.chars;

    let qi = 0; // query syllables index
    let qsi = 0; // query syllable strokes index
    let pi = 0; // parts index

    const matches: number[][] = [];


    while (qi < querySyllables.length && pi < parts.length) {
        const part = parts[pi];
        const tStrokes = part.strokes;
        matches[pi] ??= [];

        TARGET_CHAR_LOOP:
        for (let ti = 0; ti < tStrokes.length && qi < querySyllables.length; ti++) {
            const qSyl = querySyllables[qi];
            const qStrokes = qSyl.strokes;
            // console.log(qi, qsi, pi, ti)
            const tSyl = tStrokes[ti];

            // spillover
            if (qsi !== 0) {
                if (qStrokes[qsi] !== tSyl[0]) {
                    // target의 다음 글자로 이동
                    continue;
                }

                // 성공
                qsi++;

                // 겹받침이었던 경우 qStokes가 아직 남아있음
                if (qsi < qStrokes.length) {
                    // 현재 타겟 글자의 초성에는 이미 매치를 시켰으므로 다음 글자로 이동해야함.
                    // 한 글자에 초성이 두개 있을 순 없고 겹받침은 당연히 초성자리에 올 수 없다. 이름부터 받침이니깐
                    continue;
                } else {
                    // spillover 완료
                    qsi = 0;
                    qi++;
                    matches[pi].push(ti);
                    continue;
                }
            }

            // console.log(qStrokes)
            // 두 배열은 완전히 intern 상태이기 때문에 참조 비교가 가능.
            if (qStrokes === tSyl) {
                // console.log("완전 매치", qi, pi, ti);
                qi++;
                matches[pi].push(ti);
                continue;
            }

            if (qStrokes[0] !== tSyl[0]) {
                // 첫 stroke가 다르다면 더 볼 것도 없다. 다음 타겟 글자로 advance
                continue;
            }

            if (qStrokes.length > 1) {
                for (qsi = 1; qsi < qStrokes.length; qsi++) {
                    if (qStrokes[qsi] !== tSyl[qsi]) {
                        // const sIsVowel = qSyl.vowelIndex !== -1 && qsi >= qSyl.vowelIndex && (qSyl.tailIndex === -1 || qsi < qSyl.tailIndex);

                        if (qSyl.vowelIndex === -1 || qsi < qSyl.vowelIndex) {
                            // qSyl에 모음이 없거나 아직 모음이 시작되기 전(사실 이건 불가능한 케이스)
                            // 즉 겹받침이 초성자리에 들어온 경우임. 예: 'ㄳ', 'ㄻ'
                            // 이 경우 qStrokes는 'ㄳ' => ['ㄱ','ㅅ'], 'ㄻ' => ['ㄹ','ㅁ'] 일 것임.
                            // 이건 무조건 spillover 허용해야함.
                            // ㄳ => '감사', '개선', '관악산' 등에 매치가 되어야 함.
                            matches[pi].push(ti);
                            continue TARGET_CHAR_LOOP;
                        } else if (qSyl.tailIndex === -1 || qsi < qSyl.tailIndex || !qSyl.allowTailSpillover) {
                            // query의 stroke이 모음인 경우 이 글자 실패
                            // allowTailSpillover가 false인 경우에도 이 글자 실패
                            qsi = 0;
                            continue TARGET_CHAR_LOOP;
                        } else {
                            // 종성에서 실패한 경우 spillover 허용
                            // qsi 유지하고 다음 타겟 글자로 넘어감
                            matches[pi].push(ti);
                            continue TARGET_CHAR_LOOP;
                        }
                    }
                }

                // query의 stokes는 모두 매치를 시켰지만 타겟 글자에 남은 stroke가 있을 수 있다.
                if (qsi < tSyl.length) {
                    // 실패로 처리할까?
                    // 검색어 "도"가 "돋음"이나 "됐음"에 매치가 되어도 괜찮냐는 문제.
                    // 일단 지금은 allowTailSpillover가 true인 경우에만 허용하자
                    if (!qSyl.allowTailSpillover) {
                        // allowTailSpillover가 false면 이 타겟 글자는 아닌 걸로...
                        // 다음 타겟 글자로 이동하되, qsi는 리셋해서 첫 stroke부터 다시 시도해야함.
                        qsi = 0;
                        continue TARGET_CHAR_LOOP;
                    }
                }
            }

            qsi = 0;
            qi++;
            matches[pi].push(ti);
        }


        pi++;
    }


    if (qi < querySyllables.length) {
        return null;
    }


    return matches;
}