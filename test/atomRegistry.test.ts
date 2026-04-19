import { describe, expect, it } from "vitest";
import { preprocessTarget } from "../src/index";
import { atomCharToId, hasDynamicAtoms, restoreDynamicAtoms, snapshotDynamicAtoms } from "../src/internal/atomRegistry";

// 모듈 레벨 registry를 공유하므로 테스트 순서가 중요.
// vitest는 파일 단위로 worker를 분리하므로 다른 파일과는 격리됨.
describe("atom registry: hasDynamicAtoms / snapshot / restore", () => {
    it("hasDynamicAtoms is false for Korean+ASCII only", () => {
        preprocessTarget("안녕하세요 hello world");
        expect(hasDynamicAtoms()).toBe(false);
        expect(snapshotDynamicAtoms()).toEqual([]);
    });

    it("hasDynamicAtoms becomes true after CJK allocation", () => {
        atomCharToId("漢");
        expect(hasDynamicAtoms()).toBe(true);
    });

    it("snapshot returns [char, id] tuples in dynamic ID range", () => {
        const id1 = atomCharToId("字");
        const id2 = atomCharToId("符");

        const map = new Map(snapshotDynamicAtoms());
        expect(map.get("字")).toBe(id1);
        expect(map.get("符")).toBe(id2);
        expect(id1).toBeGreaterThanOrEqual(129);
        expect(id1).toBeLessThanOrEqual(65535);
        expect(id2).toBeGreaterThanOrEqual(129);
        expect(id2).toBeLessThanOrEqual(65535);
    });

    it("restore is idempotent for already-registered chars", () => {
        const id = atomCharToId("已");
        const before = new Map(snapshotDynamicAtoms());

        restoreDynamicAtoms(snapshotDynamicAtoms());

        expect(atomCharToId("已")).toBe(id);
        const after = new Map(snapshotDynamicAtoms());
        expect(after).toEqual(before);
    });

    it("restore registers a new char→id mapping that atomCharToId then returns", () => {
        const fresh = "\u9100";
        const fakeId = 250;

        restoreDynamicAtoms([[fresh, fakeId]]);
        expect(atomCharToId(fresh)).toBe(fakeId);
    });

    it("restore advances nextDynamicId past restored IDs (no collision on subsequent alloc)", () => {
        const restored = "\u9200";
        const highId = 5000;
        restoreDynamicAtoms([[restored, highId]]);

        const newId = atomCharToId("\u9201");
        expect(newId).toBeGreaterThan(highId);
    });

    it("Target.atomsFlat ID survives snapshot+restore round-trip", () => {
        const ch = "\u9300";
        const target = preprocessTarget(`prefix${ch}suffix`);

        const snapshot = snapshotDynamicAtoms();
        const expectedId = new Map(snapshot).get(ch);
        expect(expectedId).toBeDefined();

        restoreDynamicAtoms(snapshot);
        expect(atomCharToId(ch)).toBe(expectedId);

        const charIndex = "prefix".length;
        const graphemeIndex = target.graphemeIndexes[charIndex];
        const atomOffset = target.atomStarts[graphemeIndex];
        expect(target.atomsFlat[atomOffset]).toBe(expectedId);
    });
});
