import { describe, expect, it } from "vitest";
import { buildQuery, matchBest, matchFields, preprocessTarget } from "../src/index";
import type { MatchField, ScoringConfig } from "../src/types";

const title = preprocessTarget("부동산 임대차 계약서 검토");
const creator = preprocessTarget("홍길동");

const split = (input: string) => buildQuery(input, { whitespace: "split" });

describe("matchFields", () => {
    it("1. 퇴화 불변식: 단일 필드는 matchBest와 score·indices 일치", () => {
        for (const input of ["임대 검토", "부동산", "계약 검토"]) {
            const q = split(input);
            const mf = matchFields(q, [{ target: title }]);
            const mb = matchBest(q, title);
            expect(mf).not.toBeNull();
            expect(mb).not.toBeNull();
            if (mf === null || mb === null) continue;
            expect(mf.score).toBe(mb.score);
            expect(mf.perField[0]?.indices).toEqual(mb.indices);
        }
    });

    it("2. 크로스필드 AND 성립 (단일 필드로는 각각 miss)", () => {
        const q = split("홍길동 계약서");
        // 전제: 어느 단일 필드로도 전체 쿼리는 매치되지 않는다 (이슈 31 실측)
        expect(matchBest(q, title)).toBeNull();
        expect(matchBest(q, creator)).toBeNull();

        const r = matchFields(q, [{ target: title }, { target: creator }]);
        expect(r).not.toBeNull();
    });

    it("3. AND 실패 → null", () => {
        const q = split("홍길동 없는말");
        expect(matchFields(q, [{ target: title }, { target: creator }])).toBeNull();
    });

    it("4. weight로 필드 귀속 반전 (두 필드 모두 매치되는 토큰)", () => {
        const t = preprocessTarget("계약서");
        const q = split("계");

        const equal = matchFields(q, [{ target: t }, { target: t }]);
        expect(equal?.perField[0]).not.toBeNull();
        expect(equal?.perField[1]).toBeNull(); // 동점 → 낮은 인덱스

        const weighted = matchFields(q, [{ target: t }, { target: t, weight: 2 }]);
        expect(weighted?.perField[0]).toBeNull();
        expect(weighted?.perField[1]).not.toBeNull(); // weight로 필드 1로 이동
    });

    it("5. 음수 스코어 부호 보존: weight 큰 필드가 불리해지지 않음", () => {
        const t = preprocessTarget("계약서");
        const q = split("계");
        const scoring: ScoringConfig = { weights: { targetLengthPenalty: -1000 } };

        // 전제 가드: 이 scoring 으로 raw score 가 음수
        const raw = matchBest(q, t, scoring);
        expect(raw?.score ?? 0).toBeLessThan(0);

        // 음수에서 weight 2 → score/2 (0 에 더 가까움 = 더 유리) → 필드 1 승
        const r = matchFields(q, [{ target: t }, { target: t, weight: 2 }], { scoring });
        expect(r?.perField[0]).toBeNull();
        expect(r?.perField[1]).not.toBeNull();
    });

    it("6. 초성-only 토큰: gate 없이 모든 필드에서 후보 (chosung 옵션 제거, issue #36)", () => {
        const chosungTok = split("ㅎㄱㄷ");

        // gate 가 없으므로 초성-only 토큰도 모든 필드에서 후보. creator(홍길동)에 초성 매치되고
        // weighted argmax 로 귀속된다. title 엔 ㅎㄱㄷ 초성 시퀀스가 없어 miss.
        const r1 = matchFields(chosungTok, [{ target: title }, { target: creator }]);
        expect(r1).not.toBeNull();
        expect(r1?.perField[0]).toBeNull();
        expect(r1?.perField[1]).not.toBeNull();

        // 기존 r2(양쪽 chosung:false → null) 대체: gate 제거로 이제 non-null 매치가 된다.
        // 필드 순서를 뒤집어(creator=필드0) argmax 귀속이 순서 무관하게 성립하는지도 함께 검증.
        const r2 = matchFields(chosungTok, [{ target: creator }, { target: title }]);
        expect(r2).not.toBeNull();
        expect(r2?.perField[0]).not.toBeNull(); // creator(필드0)에 귀속
        expect(r2?.perField[1]).toBeNull(); // title 은 여전히 miss

        // 혼합 토큰(모음 포함)도 정상 매치
        const mixed = split("홍ㄱ");
        const r3 = matchFields(mixed, [{ target: creator }]);
        expect(r3).not.toBeNull();
        expect(r3?.perField[0]).not.toBeNull();
    });

    it("7. weighted 동점 → 낮은 필드 인덱스 귀속", () => {
        const q = split("홍");
        const r = matchFields(q, [{ target: creator }, { target: creator }]);
        expect(r?.perField[0]).not.toBeNull();
        expect(r?.perField[1]).toBeNull();
    });

    it("8. perField 귀속: 토큰이 argmax 필드에만 하이라이트", () => {
        const q = split("홍길동 계약서");
        const r = matchFields(q, [{ target: title }, { target: creator }]);
        expect(r).not.toBeNull();
        // title 의 "계약서" grapheme 인덱스 8,9,10
        expect(r?.perField[0]?.indices).toEqual([8, 9, 10]);
        // creator 의 "홍길동" grapheme 인덱스 0,1,2
        expect(r?.perField[1]?.indices).toEqual([0, 1, 2]);
    });

    it("9. 빈 쿼리 → match-all", () => {
        const q = split("");
        const r = matchFields(q, [{ target: title }, { target: creator }]);
        expect(r).toEqual({ score: 0, perField: [null, null] });
    });

    it("10. fields 빈 배열 → null, weight ≤ 0 → RangeError", () => {
        const q = split("홍");
        expect(matchFields(q, [])).toBeNull();
        expect(() => matchFields(q, [{ target: creator, weight: 0 }])).toThrow(RangeError);
        expect(() => matchFields(q, [{ target: creator, weight: -1 }])).toThrow(RangeError);
    });

    it("11. non-split 쿼리는 통째 1토큰으로 max-over-fields", () => {
        const q = buildQuery("임대", { whitespace: "ignore" });
        const r = matchFields(q, [{ target: title }, { target: creator }]);
        expect(r).not.toBeNull();
        expect(r?.perField[0]).not.toBeNull(); // title 에 귀속
        expect(r?.perField[1]).toBeNull();
    });

    it("12. D8 계약: dedup 으로 '홍길동 홍' ≡ '홍길동'", () => {
        const fields: MatchField[] = [{ target: title }, { target: creator }];
        const a = matchFields(split("홍길동 홍"), fields);
        const b = matchFields(split("홍길동"), fields);
        expect(a).not.toBeNull();
        expect(a?.score).toBe(b?.score);
        expect(a?.perField[1]?.indices).toEqual(b?.perField[1]?.indices);
    });
});
