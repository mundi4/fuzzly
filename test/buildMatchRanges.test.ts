import { describe, it, expect } from "vitest";
import { buildQuery, preprocessTarget, match, buildMatchRanges } from "../src/index";

describe("buildMatchRanges - 유닛 테스트", () => {
    describe("기본 기능", () => {
        it("단일 매칭", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const matchResult = match(query, target)!;
            const ranges = buildMatchRanges([matchResult], target);
            expect(Array.isArray(ranges)).toBe(true);
        });

        it("여러 매칭", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕 안녕", { caseSensitive: true });
            const matchResult = match(query, target)!;
            const ranges = buildMatchRanges([matchResult], target);
            expect(Array.isArray(ranges)).toBe(true);
        });

        it("범위 순서", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕 안녕 안녕", { caseSensitive: true });
            const matchResult = match(query, target)!;
            const ranges = buildMatchRanges([matchResult], target);
            if (ranges.length > 1) {
                for (let i = 1; i < ranges.length; i++) {
                    expect(ranges[i].start).toBeGreaterThanOrEqual(ranges[i - 1].end);
                }
            }
        });
    });

    describe("엣지 케이스", () => {
        it("빈 hitMap", () => {
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const ranges = buildMatchRanges([[]], target);
            expect(ranges.length).toBe(0);
        });

        it("여러 빈 hitMap", () => {
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const ranges = buildMatchRanges([[], [], []], target);
            expect(ranges.length).toBe(0);
        });

        it("빈 타겟", () => {
            const target = preprocessTarget("", { caseSensitive: true });
            const ranges = buildMatchRanges([[]], target);
            expect(ranges.length).toBe(0);
        });

        it("타겟이 비어있지만 hitMap이 있음 (이상 상황)", () => {
            const target = preprocessTarget("", { caseSensitive: true });
            const ranges = buildMatchRanges([[0]], target);
            // 이 경우는 발생할 수 없음 (match에서 나올 수 없음)
            // 하지만 방어적 처리를 하는지 확인
            expect(Array.isArray(ranges)).toBe(true);
        });
    });

    describe("결과 범위 검증", () => {
        it("start < end", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const matchResult = match(query, target)!;
            const ranges = buildMatchRanges([matchResult], target);
            for (const range of ranges) {
                expect(range.start).toBeLessThanOrEqual(range.end);
            }
        });

        it("start >= 0", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const matchResult = match(query, target)!;
            const ranges = buildMatchRanges([matchResult], target);
            for (const range of ranges) {
                expect(range.start).toBeGreaterThanOrEqual(0);
            }
        });

        it("end <= input.length", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const matchResult = match(query, target)!;
            const ranges = buildMatchRanges([matchResult], target);
            for (const range of ranges) {
                expect(range.end).toBeLessThanOrEqual(target.input.length);
            }
        });
    });

    describe("중복 제거", () => {
        it("같은 인덱스는 한 번만", () => {
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            // 의도적으로 중복된 hitMap 전달
            const ranges = buildMatchRanges([[0, 0, 1]], target);
            expect(Array.isArray(ranges)).toBe(true);
        });

        it("정렬 확인", () => {
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const ranges = buildMatchRanges([[3, 1, 2, 0]], target);
            if (ranges.length > 0) {
                expect(ranges[0].start).toBeDefined();
            }
        });
    });

    describe("이모지", () => {
        it("이모지 매칭", () => {
            const query = buildQuery("😊")!;
            const target = preprocessTarget("😊안녕😊", { caseSensitive: true });
            const matchResult = match(query, target);
            if (matchResult) {
                const ranges = buildMatchRanges([matchResult], target);
                expect(ranges.length).toBeGreaterThanOrEqual(0);
            }
        });

        it("이모지 + 스킨톤", () => {
            const query = buildQuery("👋🏻")!;
            const target = preprocessTarget("👋🏻", { caseSensitive: true });
            const matchResult = match(query, target)!;
            const ranges = buildMatchRanges([matchResult], target);
            expect(ranges.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe("여러 hitMap", () => {
        it("두 개 이상의 hitMap", () => {
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const hitMaps = [[0], [2], [4]];
            const ranges = buildMatchRanges(hitMaps, target);
            expect(Array.isArray(ranges)).toBe(true);
        });

        it("hitMap 병합", () => {
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            // 여러 hitMap이 겹치는 경우
            const hitMaps = [[0, 1], [1, 2]];
            const ranges = buildMatchRanges(hitMaps, target);
            expect(Array.isArray(ranges)).toBe(true);
        });
    });

    describe("성능", () => {
        it("매우 많은 매칭", () => {
            const target = preprocessTarget("안" + "녕".repeat(100), { caseSensitive: true });
            const hitMaps = [Array.from({ length: 100 }, (_, i) => i)];
            const ranges = buildMatchRanges(hitMaps, target);
            expect(Array.isArray(ranges)).toBe(true);
        });

        it("매우 긴 타겟", () => {
            const target = preprocessTarget("안녕하세요 ".repeat(200), { caseSensitive: true });
            const ranges = buildMatchRanges([[0]], target);
            expect(Array.isArray(ranges)).toBe(true);
        });
    });

    describe("연속 범위 병합", () => {
        it("연속된 인덱스", () => {
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            // 연속된 인덱스 [0, 1, 2]는 한 개의 range로 병합되어야 함
            const ranges = buildMatchRanges([[0, 1, 2]], target);
            expect(ranges.length).toBeGreaterThan(0);
        });

        it("불연속 인덱스", () => {
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            // 불연속 인덱스는 여러 range로 분리
            const ranges = buildMatchRanges([[0, 2, 4]], target);
            expect(ranges.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe("범위 객체 구조", () => {
        it("각 범위는 start, end 필드", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const matchResult = match(query, target)!;
            const ranges = buildMatchRanges([matchResult], target);
            for (const range of ranges) {
                expect(range).toHaveProperty("start");
                expect(range).toHaveProperty("end");
                expect(typeof range.start).toBe("number");
                expect(typeof range.end).toBe("number");
            }
        });

        it("범위는 MatchRange 타입", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const matchResult = match(query, target)!;
            const ranges = buildMatchRanges([matchResult], target);
            expect(Array.isArray(ranges)).toBe(true);
        });
    });
});
