import { describe, expect, it } from "vitest";
import { preprocessTarget } from "../src/index";

describe("preprocessTarget - 유닛 테스트", () => {
    describe("기본 기능", () => {
        it("한글 한 글자", () => {
            const target = preprocessTarget("안");
            expect(target.normalizedInput).toBe("안");
            expect(target.graphemeCount).toBe(1);
        });

        it("한글 여러 글자", () => {
            const target = preprocessTarget("안녕하세요");
            expect(target.normalizedInput).toBe("안녕하세요");
            expect(target.graphemeCount).toBe(5);
        });

        it("영문", () => {
            const target = preprocessTarget("abc");
            expect(target.graphemeCount).toBe(3);
        });

        it("숫자", () => {
            const target = preprocessTarget("123");
            expect(target.graphemeCount).toBe(3);
        });

        it("이모지", () => {
            const target = preprocessTarget("😊");
            expect(target.graphemeCount).toBeGreaterThan(0);
        });

        it("한글 + 영문 + 숫자 혼합", () => {
            const target = preprocessTarget("안a1");
            expect(target.graphemeCount).toBe(3);
        });
    });

    describe("엣지 케이스", () => {
        it("빈 문자열", () => {
            const target = preprocessTarget("");
            expect(target.normalizedInput).toBe("");
            expect(target.graphemeCount).toBe(0);
        });

        it("공백만", () => {
            const target = preprocessTarget("   ");
            expect(target.graphemeCount).toBeGreaterThan(0);
        });

        it("탭", () => {
            const target = preprocessTarget("\t");
            expect(target.graphemeCount).toBeGreaterThan(0);
        });

        it("줄바꿈", () => {
            const target = preprocessTarget("\n");
            expect(target.graphemeCount).toBeGreaterThan(0);
        });

        it("공백이 있는 텍스트", () => {
            const target = preprocessTarget("안 녕 하");
            expect(target.graphemeCount).toBeGreaterThan(3); // 공백 포함
        });

        it("이모지 여러 개", () => {
            const target = preprocessTarget("😊👍🎉");
            expect(target.graphemeCount).toBeGreaterThan(0);
        });

        it("복합 이모지 (스킨톤)", () => {
            const target = preprocessTarget("👋🏻");
            expect(target.graphemeCount).toBeGreaterThan(0);
        });

        it("ZWJ 이모지", () => {
            const target = preprocessTarget("👨‍👩‍👧‍👦");
            expect(target.graphemeCount).toBeGreaterThan(0);
        });
    });

    describe("대소문자 (항상 소문자 정규화)", () => {
        it("대문자는 소문자로 정규화", () => {
            const target = preprocessTarget("ABC");
            expect(target.normalizedInput).toBe("abc");
        });

        it("혼합 대소문자도 소문자로 정규화", () => {
            const target = preprocessTarget("AbC");
            expect(target.normalizedInput).toBe("abc");
        });

        it("한글은 영향 없음", () => {
            const target = preprocessTarget("안");
            expect(target.normalizedInput).toBe("안");
        });

        it("혼합 텍스트", () => {
            const target = preprocessTarget("An녕");
            expect(target.normalizedInput).toBe("an녕");
        });

        it("input 필드는 원본 유지", () => {
            const target = preprocessTarget("ABC");
            expect(target.input).toBe("ABC");
        });
    });

    describe("boundaryFlags", () => {
        it("첫 grapheme은 항상 boundary", () => {
            const target = preprocessTarget("안녕");
            expect(target.boundaryFlags[0]).toBe(1);
        });

        it("공백 다음은 boundary", () => {
            const target = preprocessTarget("안 녕");
            // graphemes: [안, " ", 녕]
            expect(target.boundaryFlags[2]).toBe(1);
        });

        it("밑줄 다음은 boundary", () => {
            const target = preprocessTarget("hello_world");
            // graphemes: h,e,l,l,o,_,w,o,r,l,d
            expect(target.boundaryFlags[6]).toBe(1);
        });

        it("하이픈 다음은 boundary", () => {
            const target = preprocessTarget("hello-world");
            expect(target.boundaryFlags[6]).toBe(1);
        });

        it("점 다음은 boundary", () => {
            const target = preprocessTarget("file.txt");
            // graphemes: f,i,l,e,.,t,x,t
            expect(target.boundaryFlags[5]).toBe(1);
        });

        it("연속 문자 중간은 boundary 아님", () => {
            const target = preprocessTarget("hello");
            expect(target.boundaryFlags[1]).toBe(0);
            expect(target.boundaryFlags[2]).toBe(0);
        });

        it("빈 문자열의 boundaryFlags는 빈 배열", () => {
            const target = preprocessTarget("");
            expect(target.boundaryFlags.length).toBe(0);
        });

        it("boundaryFlags 길이는 graphemeCount와 동일", () => {
            const target = preprocessTarget("hello_world 안녕");
            expect(target.boundaryFlags.length).toBe(target.graphemeCount);
        });
    });

    describe("Index 정확성", () => {
        it("charIndexes 길이", () => {
            const target = preprocessTarget("한글");
            expect(target.charIndexes.length).toBe(target.graphemeCount);
        });

        it("charIndexes 증가", () => {
            const target = preprocessTarget("한글");
            for (let i = 1; i < target.charIndexes.length; i++) {
                expect(target.charIndexes[i]).toBeGreaterThanOrEqual(target.charIndexes[i - 1]);
            }
        });

        it("graphemeIndexes 범위", () => {
            const target = preprocessTarget("한글");
            for (let i = 0; i < target.graphemeIndexes.length; i++) {
                expect(target.graphemeIndexes[i]).toBeGreaterThanOrEqual(0);
                expect(target.graphemeIndexes[i]).toBeLessThan(target.graphemeCount);
            }
        });

        it("graphemeIndexes 길이", () => {
            const input = "한글";
            const target = preprocessTarget(input);
            expect(target.graphemeIndexes.length).toBeGreaterThanOrEqual(input.length);
        });

        it("charIndexes 범위", () => {
            const input = "한글";
            const target = preprocessTarget(input);
            for (let i = 0; i < target.charIndexes.length; i++) {
                expect(target.charIndexes[i]).toBeGreaterThanOrEqual(0);
                expect(target.charIndexes[i]).toBeLessThanOrEqual(input.length);
            }
        });

        it("멀티바이트 문자의 charIndexes", () => {
            const target = preprocessTarget("a한b");
            expect(target.charIndexes[0]).toBe(0);
            expect(target.charIndexes[2]).toBeGreaterThan(target.charIndexes[1]);
        });
    });

    describe("Graphemes 구조", () => {
        it("각 grapheme은 atoms/vowelIndex/tailIndex를 가진다", () => {
            const target = preprocessTarget("한글");
            for (let i = 0; i < target.graphemeCount; i++) {
                expect(target.atomLens[i]).toBeGreaterThan(0);
                expect(typeof target.vowelIdxs[i]).toBe("number");
                expect(typeof target.tailIdxs[i]).toBe("number");
            }
        });

        it("한글 syllable은 vowel/tail 인덱스를 올바르게 계산", () => {
            const target = preprocessTarget("한");
            expect(target.atomLens[0]).toBe(3);
            expect(target.vowelIdxs[0]).toBe(1);
            expect(target.tailIdxs[0]).toBe(2);
        });

        it("영문/숫자 grapheme은 vowelIndex = -1", () => {
            const target = preprocessTarget("a1");
            expect(target.atomLens[0]).toBeGreaterThan(0);
            expect(target.vowelIdxs[0]).toBe(-1);
            expect(target.vowelIdxs[1]).toBe(-1);
        });
    });

    describe("유니코드 엣지 케이스", () => {
        it("제로 윈드 스페이스", () => {
            const target = preprocessTarget("안\u200B녕");
            expect(target.graphemeCount).toBeGreaterThan(0);
        });

        it("논-브레이킹 스페이스", () => {
            const target = preprocessTarget("안\u00A0녕");
            expect(target.graphemeCount).toBeGreaterThan(0);
        });

        it("다양한 공백 종류", () => {
            const variants = ["안 녕", "안\t녕", "안\u00A0녕", "안\n녕"];

            for (const text of variants) {
                const target = preprocessTarget(text);
                expect(target.graphemeCount).toBeGreaterThan(0);
            }
        });

        it("스킨톤 이모지", () => {
            const target = preprocessTarget("👋🏻👋🏼");
            expect(target.graphemeCount).toBeGreaterThan(0);
        });
    });

    describe("성능 관련", () => {
        it("매우 긴 텍스트", () => {
            const longText = "안녕하세요 ".repeat(200);
            const target = preprocessTarget(longText);
            expect(target.graphemeCount).toBeGreaterThan(0);
            expect(target.normalizedInput.length).toBe(longText.length);
        });

        it("매우 긴 영문", () => {
            const longText = "abcdefghijklmnopqrstuvwxyz".repeat(20);
            const target = preprocessTarget(longText);
            expect(target.normalizedInput).toBe(longText.toLowerCase());
        });

        it("혼합 긴 텍스트", () => {
            const longText = "안a1 ".repeat(100).trim();
            const target = preprocessTarget(longText);
            expect(target.graphemeCount).toBeGreaterThan(0);
        });
    });

    describe("Target 구조 검증", () => {
        it("input 필드", () => {
            const target = preprocessTarget("안");
            expect(typeof target.normalizedInput).toBe("string");
        });

        it("graphemeCount", () => {
            const target = preprocessTarget("안");
            expect(target.graphemeCount).toBe(1);
        });

        it("graphemeIndexes는 Uint16Array", () => {
            const target = preprocessTarget("안");
            expect(target.graphemeIndexes).toBeInstanceOf(Uint16Array);
        });

        it("charIndexes는 Uint16Array", () => {
            const target = preprocessTarget("안");
            expect(target.charIndexes).toBeInstanceOf(Uint16Array);
        });

        it("boundaryFlags는 Uint8Array", () => {
            const target = preprocessTarget("안");
            expect(target.boundaryFlags).toBeInstanceOf(Uint8Array);
        });

        it("모든 필드 존재", () => {
            const target = preprocessTarget("안");
            expect(target).toHaveProperty("input");
            expect(target).toHaveProperty("graphemeCount");
            expect(target).toHaveProperty("atomsFlat");
            expect(target).toHaveProperty("atomStarts");
            expect(target).toHaveProperty("atomLens");
            expect(target).toHaveProperty("vowelIdxs");
            expect(target).toHaveProperty("tailIdxs");
            expect(target).toHaveProperty("graphemeIndexes");
            expect(target).toHaveProperty("charIndexes");
            expect(target).toHaveProperty("boundaryFlags");
        });
    });

    describe("Readonly 검증", () => {
        it("grapheme atoms는 Uint8Array", () => {
            const target = preprocessTarget("한");
            expect(target.atomsFlat).toBeInstanceOf(Uint8Array);
            expect(target.atomLens[0]).toBe(3);
        });
    });
});
