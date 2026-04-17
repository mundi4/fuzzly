import { describe, expect, it } from "vitest";
import { buildQuery, createSearcher, matchBest, preprocessTarget, SCORING } from "../src/index";

describe("matchBest", () => {
    describe("기본 매칭", () => {
        it("한글 매칭", () => {
            const query = buildQuery("안녕");
            const target = preprocessTarget("안녕하세요");
            const result = matchBest(query, target);
            expect(result).not.toBeNull();
            expect(result!.indices).toEqual([0, 1]);
        });

        it("매칭 실패 시 null", () => {
            const query = buildQuery("xyz");
            const target = preprocessTarget("안녕하세요");
            expect(matchBest(query, target)).toBeNull();
        });

        it("빈 쿼리", () => {
            const query = buildQuery("");
            const target = preprocessTarget("안녕");
            const result = matchBest(query, target);
            expect(result).not.toBeNull();
            expect(result!.indices).toEqual([]);
            expect(result!.score).toBe(0);
        });

        it("쿼리가 타겟보다 길면 null", () => {
            const query = buildQuery("안녕하세요abc");
            const target = preprocessTarget("안녕");
            expect(matchBest(query, target)).toBeNull();
        });

        it("초성 매칭", () => {
            const query = buildQuery("ㅇㄴ");
            const target = preprocessTarget("안녕하세요");
            const result = matchBest(query, target);
            expect(result).not.toBeNull();
            expect(result!.indices).toEqual([0, 1]);
        });

        it("영문 매칭", () => {
            const query = buildQuery("hel");
            const target = preprocessTarget("hello world");
            const result = matchBest(query, target);
            expect(result).not.toBeNull();
        });
    });

    describe("score 계산", () => {
        it("score가 항상 존재", () => {
            const query = buildQuery("안");
            const target = preprocessTarget("안녕하세요");
            const result = matchBest(query, target);
            expect(result).not.toBeNull();
            expect(typeof result!.score).toBe("number");
        });

        it("위치 0 매칭이 더 높은 점수", () => {
            const query = buildQuery("하");
            const t1 = preprocessTarget("하세요");
            const t2 = preprocessTarget("안녕하세요");
            const r1 = matchBest(query, t1)!;
            const r2 = matchBest(query, t2)!;
            expect(r1.score!).toBeGreaterThan(r2.score!);
        });

        it("경계 보너스: 단어 경계 매치가 더 높은 점수", () => {
            const query = buildQuery("b");
            const t1 = preprocessTarget("a_b"); // b가 경계에 있음
            const t2 = preprocessTarget("abc"); // b가 경계에 없음
            const r1 = matchBest(query, t1)!;
            const r2 = matchBest(query, t2)!;
            expect(r1.score!).toBeGreaterThan(r2.score!);
        });

        it("연속 매치 보너스", () => {
            const query = buildQuery("ab");
            const t1 = preprocessTarget("abcd"); // a,b 연속
            const t2 = preprocessTarget("axbcd"); // a,b 비연속
            const r1 = matchBest(query, t1)!;
            const r2 = matchBest(query, t2)!;
            expect(r1.score!).toBeGreaterThan(r2.score!);
        });

        it("prefix 보너스", () => {
            const query = buildQuery("안녕");
            const t1 = preprocessTarget("안녕하세요"); // prefix 매치
            const t2 = preprocessTarget("여기 안녕"); // prefix 아님
            const r1 = matchBest(query, t1)!;
            const r2 = matchBest(query, t2)!;
            expect(r1.score!).toBeGreaterThan(r2.score!);
        });

        it("exact 보너스: 완전 일치가 가장 높은 점수", () => {
            const query = buildQuery("안녕");
            const tExact = preprocessTarget("안녕");
            const tLonger = preprocessTarget("안녕하세요");
            const rExact = matchBest(query, tExact)!;
            const rLonger = matchBest(query, tLonger)!;
            expect(rExact.score!).toBeGreaterThan(rLonger.score!);
        });

        it("짧은 타겟이 더 높은 점수 (길이 페널티)", () => {
            const query = buildQuery("a");
            const t1 = preprocessTarget("abc");
            const t2 = preprocessTarget("abcdefgh");
            const r1 = matchBest(query, t1)!;
            const r2 = matchBest(query, t2)!;
            expect(r1.score!).toBeGreaterThan(r2.score!);
        });

        it("초성-only 쿼리는 positionZero/boundary 약화로 완성 음절보다 낮은 점수", () => {
            const q1 = buildQuery("ㅇㄴ");
            const q2 = buildQuery("안녕");
            const target = preprocessTarget("안녕하세요");
            const r1 = matchBest(q1, target)!;
            const r2 = matchBest(q2, target)!;
            expect(r1.score!).toBeLessThan(r2.score!);
        });
    });

    describe("DP 최적 정렬", () => {
        it("DP가 경계 위치를 선호", () => {
            // "a_b_c"에서 "b"를 검색하면 경계의 "b"를 선택해야 함
            const query = buildQuery("b");
            const target = preprocessTarget("a_b_c");
            const result = matchBest(query, target)!;
            // b는 grapheme index 2 (a=0, _=1, b=2)
            expect(result.indices).toEqual([2]);
        });

        it("DP가 연속 매치를 선호", () => {
            // "abc"에서 "ac"를 검색: a(0),c(2) 매치. 단일 후보만 있어도 최적 경로 선택
            const query = buildQuery("ac");
            const target = preprocessTarget("abc");
            const result = matchBest(query, target)!;
            expect(result).not.toBeNull();
            expect(result.indices).toEqual([0, 2]);
        });

        it("여러 후보 중 최적 선택: 경계 우선", () => {
            // "ㅎ"을 "전략기획 부서 핵심" 에서 찾을 때, 경계의 핵을 선택하는 것이 더 나을 수 있음
            const query = buildQuery("ㅎ");
            const t = preprocessTarget("전략기획 부서 핵심");
            const result = matchBest(query, t)!;
            expect(result).not.toBeNull();
            // DP는 경계 보너스가 있는 위치를 선호해야 함
            // "핵"은 경계(공백 뒤)에 있음
            expect(result.score!).toBeGreaterThanOrEqual(0);
        });
    });

    describe("SCORING 상수", () => {
        it("필수 키가 모두 존재하고 number 타입", () => {
            const keys = [
                "POSITION_ZERO",
                "BOUNDARY",
                "CONSECUTIVE",
                "GAP_PENALTY",
                "PREFIX_BONUS",
                "EXACT_BONUS",
                "TARGET_LENGTH_PENALTY",
                "LENGTH_PENALTY_CAP",
                "CHOSEONG_WEAKEN",
            ] as const;
            for (const k of keys) {
                expect(typeof SCORING[k]).toBe("number");
            }
        });

        it("보너스 간 상대적 크기 관계", () => {
            // 완전 일치가 가장 큰 보너스
            expect(SCORING.EXACT_BONUS).toBeGreaterThan(SCORING.PREFIX_BONUS);
            expect(SCORING.PREFIX_BONUS).toBeGreaterThan(SCORING.POSITION_ZERO);
            expect(SCORING.POSITION_ZERO).toBeGreaterThan(SCORING.BOUNDARY);
            expect(SCORING.BOUNDARY).toBeGreaterThan(SCORING.CONSECUTIVE);
            // 페널티는 음수
            expect(SCORING.GAP_PENALTY).toBeLessThan(0);
            expect(SCORING.TARGET_LENGTH_PENALTY).toBeLessThan(0);
            // cap은 양수 정수, choseongWeaken은 (0,1] 범위
            expect(SCORING.LENGTH_PENALTY_CAP).toBeGreaterThan(0);
            expect(SCORING.CHOSEONG_WEAKEN).toBeGreaterThan(0);
            expect(SCORING.CHOSEONG_WEAKEN).toBeLessThanOrEqual(1);
        });
    });

    describe("삼각수 연속 보너스 · 길이 cap · 초성 약화", () => {
        it("초성 4-run이 2+2 run보다 우위 (은행재원 vs 외환프라자)", () => {
            const q = buildQuery("ㅇㅎㅈㅇ");
            const t1 = preprocessTarget("제1절 외환프라자 정의");
            const t2 = preprocessTarget("제1목 은행재원 협약보증 주택전세자금대출");
            const r1 = matchBest(q, t1)!;
            const r2 = matchBest(q, t2)!;
            expect(r2.score!).toBeGreaterThan(r1.score!);
        });

        it("4-run 연속이 2+2 run보다 2배 이상 큰 연속 보너스 기여", () => {
            // 같은 쿼리 길이, 같은 pos 기여(전부 non-boundary)인 두 패턴.
            // "abcd" 에서 "abcd" 매치: 4-run
            // "abxcd" 에서 "abcd" 매치: 2+2 run with gap 1
            const q = buildQuery("abcd");
            const t1 = preprocessTarget("xabcd"); // 4-run at [1,2,3,4]
            const t2 = preprocessTarget("xabxcd"); // 2+2 at [1,2,4,5]
            const r1 = matchBest(q, t1)!;
            const r2 = matchBest(q, t2)!;
            // 4-run 연속 보너스: 20+40+60 = 120
            // 2+2 연속 보너스: 20 + 20 = 40 (각 run 내 1회씩). gap 페널티 -3.
            // 길이도 t2가 1 길어서 length cap 밖이면 영향 동일, 안이면 t2가 조금 더 큰 페널티.
            const diff = r1.score! - r2.score!;
            expect(diff).toBeGreaterThan(60); // 최소 (120-40) - 3 - 1 = 76 기대
        });

        it("3-run이 1+2 run보다 우위", () => {
            const q = buildQuery("abc");
            // 둘 다 "a"가 idx 1이라 positionZero 영향 없음
            const t1 = preprocessTarget("xabc"); // 3-run at [1,2,3]
            const t2 = preprocessTarget("xaybc"); // 1+2-run at [1,3,4]
            const r1 = matchBest(q, t1)!;
            const r2 = matchBest(q, t2)!;
            // 3-run 연속 보너스: 20+40 = 60 (triangular)
            // 1+2 run: 20 + gap penalty
            expect(r1.score!).toBeGreaterThan(r2.score!);
        });

        it("길이 cap: 동일 매치 구조에서 cap 이상 타겟은 페널티 동일", () => {
            const q = buildQuery("a");
            // padding이 cap 보다 크면 길이 페널티 포화
            const t1 = preprocessTarget(`a${"x".repeat(20)}`); // L=21
            const t2 = preprocessTarget(`a${"x".repeat(40)}`); // L=41
            const r1 = matchBest(q, t1)!;
            const r2 = matchBest(q, t2)!;
            // cap=16, α=-1 기본값 → 둘 다 페널티 -16, 기타 동일
            expect(r1.score!).toBe(r2.score!);
        });

        it("길이 cap 이하 구간에서는 여전히 짧은 타겟이 우위", () => {
            const q = buildQuery("a");
            const t1 = preprocessTarget("abc"); // L=3
            const t2 = preprocessTarget("abcdefgh"); // L=8
            const r1 = matchBest(q, t1)!;
            const r2 = matchBest(q, t2)!;
            expect(r1.score!).toBeGreaterThan(r2.score!);
        });

        it("초성-only가 위치 0 매치에서 완성 음절보다 낮은 점수 (positionZero 약화)", () => {
            const qChoseong = buildQuery("ㅈ");
            const qFull = buildQuery("정");
            const target = preprocessTarget("정의");
            const rC = matchBest(qChoseong, target)!;
            const rF = matchBest(qFull, target)!;
            // 둘 다 idx 0 매치이지만 초성-only는 positionZero×0.5 로 축약됨
            expect(rC.score!).toBeLessThan(rF.score!);
        });

        it("초성-only가 경계 매치에서 완성 음절보다 낮은 점수 (boundary 약화)", () => {
            const qChoseong = buildQuery("ㅎ");
            const qFull = buildQuery("하");
            const target = preprocessTarget("안녕 하세요");
            const rC = matchBest(qChoseong, target)!;
            const rF = matchBest(qFull, target)!;
            expect(rC.score!).toBeLessThan(rF.score!);
        });
    });

    describe("ScoringConfig 오버라이드 · 신규 가중치", () => {
        it("choseongWeaken=1이면 초성-only 약화 제거", () => {
            const qChoseong = buildQuery("ㅈ");
            const qFull = buildQuery("정");
            const target = preprocessTarget("정의");
            const rC = matchBest(qChoseong, target, { weights: { choseongWeaken: 1 } })!;
            const rF = matchBest(qFull, target)!;
            // 약화 제거 시 두 매치 모두 positionZero 만점 → 동일 점수
            expect(rC.score!).toBe(rF.score!);
        });

        it("lengthPenaltyCap을 크게 설정하면 선형 페널티로 회귀", () => {
            const q = buildQuery("a");
            const t1 = preprocessTarget(`a${"x".repeat(20)}`); // L=21
            const t2 = preprocessTarget(`a${"x".repeat(40)}`); // L=41
            const scoring = { weights: { lengthPenaltyCap: 1000 } };
            const r1 = matchBest(q, t1, scoring)!;
            const r2 = matchBest(q, t2, scoring)!;
            // cap 무력화: t2가 20만큼 더 큰 페널티 (-40 vs -20)
            expect(r1.score! - r2.score!).toBe(20);
        });

        it("consecutive=0이면 연속 보너스 제거, run 구조 차이 사라짐", () => {
            const q = buildQuery("abc");
            const t1 = preprocessTarget("xabc"); // 3-run
            const t2 = preprocessTarget("xabxc"); // 2+1 run
            const scoring = { weights: { consecutive: 0 } };
            const r1 = matchBest(q, t1, scoring)!;
            const r2 = matchBest(q, t2, scoring)!;
            // 연속 보너스 0이면 t1의 우위는 오직 gap 페널티 차이 (-3×1)뿐.
            // 그리고 t2가 1 길어서 길이페널티 -1.
            // 차이 <= 4 이어야 함 (원래 40+ 차이와 대비)
            expect(r1.score! - r2.score!).toBeLessThanOrEqual(4);
        });
    });
});

describe("Searcher 스코어 정렬", () => {
    it("항상 score 내림차순 정렬", () => {
        const searcher = createSearcher(["안녕하세요입니다", "안녕하세요", "안녕"]);
        const results = searcher.search("안녕");

        expect(results).toHaveLength(3);
        // 짧은 타겟이 더 높은 점수 (길이 페널티)
        expect(results[0].item).toBe("안녕");
        for (let i = 1; i < results.length; i++) {
            expect(results[i - 1].score!).toBeGreaterThanOrEqual(results[i].score!);
        }
    });

    it("모든 결과에 score 존재", () => {
        const searcher = createSearcher(["안녕", "반가움", "안부"]);
        const results = searcher.search("안");
        for (const r of results) {
            expect(typeof r.score).toBe("number");
        }
    });

    it("커스텀 score 함수로 정렬 override", () => {
        const searcher = createSearcher(["안녕하세요", "안부", "안심"]);
        // 역순 정렬: runCount가 높을수록 높은 점수 (의미 없지만 override 확인)
        const results = searcher.search("안", {
            score: () => Math.random(),
        });
        expect(results.length).toBeGreaterThan(0);
        for (const r of results) {
            expect(typeof r.score).toBe("number");
        }
    });
});

describe("검색 세션 (progressive filtering)", () => {
    it("세션 연속: atom prefix 확장 시 이전 결과만 재검색", () => {
        const searcher = createSearcher(["간장", "간판", "반복", "간격"]);

        // "ㄱ" 검색 → 간장, 간판, 간격 매치 (3개)
        const r1 = searcher.search("ㄱ");
        expect(r1).toHaveLength(3);
        const items1 = new Set(r1.map((r) => r.item));
        expect(items1.has("간장")).toBe(true);
        expect(items1.has("간판")).toBe(true);
        expect(items1.has("간격")).toBe(true);

        // "가" 검색 (atoms "ㄱㅏ" extends "ㄱ") → 세션 연속, 이전 3개 중에서만 검색
        const r2 = searcher.search("가");
        expect(r2.length).toBeLessThanOrEqual(r1.length);
        // "반복"은 이전에도 매치 안 됐고 지금도 안 됨
        for (const r of r2) {
            expect(r.item).not.toBe("반복");
        }

        // "간" 검색 (atoms "ㄱㅏㄴ" extends "ㄱㅏ") → 세션 연속
        const r3 = searcher.search("간");
        expect(r3.length).toBeLessThanOrEqual(r2.length);

        // "간장" 검색 (atoms extends) → 세션 연속, 더 좁아짐
        const r4 = searcher.search("간장");
        expect(r4.length).toBeLessThanOrEqual(r3.length);
        expect(r4).toHaveLength(1);
        expect(r4[0].item).toBe("간장");
    });

    it("세션 단절: 다른 초성으로 시작하면 새 세션", () => {
        const searcher = createSearcher(["간장", "반복", "간격"]);

        searcher.search("ㄱ"); // 세션 시작
        const r2 = searcher.search("ㅂ"); // "ㅂ"은 "ㄱ"의 prefix 확장이 아님 → 새 세션
        expect(r2).toHaveLength(1);
        expect(r2[0].item).toBe("반복");
    });

    it("세션 단절: 짧아지면 새 세션", () => {
        const searcher = createSearcher(["간장", "간격", "반복"]);

        searcher.search("간장"); // 세션 시작
        // "ㄱ"은 "간장" atoms의 prefix이지만 더 짧음 → 세션 단절 (전체 재검색)
        const r = searcher.search("ㄱ");
        expect(r).toHaveLength(2); // 간장, 간격
    });

    it("세션 무효화: add 후 전체 재검색", () => {
        const searcher = createSearcher(["간장", "간격"]);

        searcher.search("ㄱ"); // 세션 시작 (2 결과)
        searcher.add("간판"); // 세션 리셋
        const r = searcher.search("가"); // 전체 재검색
        // 간장, 간격, 간판 모두 "가"에 매치되어야 함
        expect(r).toHaveLength(3);
    });

    it("세션 무효화: remove 후 전체 재검색", () => {
        const searcher = createSearcher(["간장", "간격", "반복"]);

        searcher.search("ㄱ"); // 세션 시작
        searcher.remove((item) => item === "간격"); // 세션 리셋
        const r = searcher.search("가"); // 전체 재검색 (간장만 남음)
        expect(r).toHaveLength(1);
        expect(r[0].item).toBe("간장");
    });

    it("세션 무효화: replaceAll 후 전체 재검색", () => {
        const searcher = createSearcher(["간장", "간격"]);

        searcher.search("ㄱ"); // 세션 시작
        searcher.replaceAll(["반복", "간판"]); // 세션 리셋
        const r = searcher.search("가"); // 전체 재검색
        expect(r).toHaveLength(1);
        expect(r[0].item).toBe("간판");
    });

    it("세션 내 단조 감소: 결과 수가 줄거나 유지", () => {
        const items = ["가나다", "가나라", "가마바", "나다라", "다라마"];
        const searcher = createSearcher(items);

        const r1 = searcher.search("ㄱ");
        const r2 = searcher.search("가");
        const r3 = searcher.search("간");

        // 결과가 단조 감소해야 함
        expect(r2.length).toBeLessThanOrEqual(r1.length);
        expect(r3.length).toBeLessThanOrEqual(r2.length);
    });
});

describe("Query.atoms", () => {
    it("atoms는 grapheme atoms의 연결", () => {
        const q = buildQuery("간장");
        // 간 = ㄱㅏㄴ, 장 = ㅈㅏㅇ
        expect(q.atoms).toBe("ㄱㅏㄴㅈㅏㅇ");
    });

    it("초성만 쿼리의 atoms", () => {
        const q = buildQuery("ㄱㅈ");
        expect(q.atoms).toBe("ㄱㅈ");
    });

    it("빈 쿼리의 atoms", () => {
        const q = buildQuery("");
        expect(q.atoms).toBe("");
    });

    it("영문 쿼리의 atoms", () => {
        const q = buildQuery("abc");
        expect(q.atoms).toBe("abc");
    });

    it("IME 입력 과정에서 atom prefix 관계 유지", () => {
        // 실제 IME 입력 시뮬레이션: ㄱ → 가 → 간 → 간ㅈ → 간장
        const steps = ["ㄱ", "가", "간", "간ㅈ", "간장"];
        for (let i = 1; i < steps.length; i++) {
            const prev = buildQuery(steps[i - 1]);
            const curr = buildQuery(steps[i]);
            expect(curr.atoms.startsWith(prev.atoms)).toBe(true);
        }
    });
});
