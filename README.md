# fuzzly

한글 초성·부분 조합·IME 중간상태까지 매칭하는 커맨드팔레트용 퍼지 매칭 라이브러리.

- **초성 검색**: `"ㅍㅇ"` → `"파일 열기"`
- **부분 조합 매칭**: `"갑"` 입력 중이어도 `"가방"`에 매치 — 타이핑 도중의 모든 IME 중간상태를 수용
- **Monotonic narrowing**: 키 입력마다 결과가 좁혀지기만 함. 타이핑 도중 결과가 사라졌다 다시 나타나는 일이 없음
- **Zero-dependency**: 런타임 의존성 없음. Promise/AbortSignal도 내장하지 않아 워커·async 래핑은 소비자가 자유롭게
- **직렬화 가능한 Target**: 전처리 결과가 전부 typed array라 `structuredClone`/IndexedDB에 그대로 저장·복원 가능

## 설치

```bash
npm i fuzzly
```

## Quickstart

```ts
import { createSearcher } from "fuzzly";

const searcher = createSearcher(["파일 열기", "폴더 열기", "설정"]);
const results = searcher.search("ㅍㅇ");
// → [{ item: "파일 열기", ... }, { item: "폴더 열기", ... }]
```

하이라이트는 결과의 `ranges()`로 얻는다 (원문 UTF-16 offset 기준 `{ start, end }` 배열).
`segmentByRanges`를 쓰면 렌더링용 조각으로 바로 분할된다:

```ts
import { segmentByRanges } from "fuzzly";

for (const r of results) {
    const segments = segmentByRanges(r.target.input, r.ranges());
    // [{ text: "파일", matched: true }, { text: " 열기", matched: false }]
    // matched 조각만 <mark>로 감싸면 끝 — escape/slice boilerplate 불필요
}
```

## 객체 아이템 + `key`

아이템이 문자열이 아니면 `key`로 검색 키를 추출한다:

```ts
type Command = { id: string; title: string };

const searcher = createSearcher<Command>(commands, {
    key: (cmd) => cmd.title,
});

searcher.search("설정")[0].item; // Command 객체 그대로
```

## 멀티필드 (`fields`)

여러 필드를 구분자로 이어 붙이지 말고 (아래 [제한사항](#제한사항) 참고) `fields`를 쓴다.
쿼리 토큰별로 가장 잘 맞는 필드에 매치가 귀속되는 **토큰 단위 cross-field AND** 매칭이다:

```ts
type Note = { title: string; body: string };

const searcher = createSearcher<Note>(notes, {
    fields: [
        { key: (n) => n.title, weight: 2 }, // 제목 가중치 2배
        { key: (n) => n.body },
    ],
    whitespace: "split", // 토큰 분리는 split 모드와 함께
});

const results = searcher.search("멋진 제목"); // "제목 멋진"과 동일 (순서 무관 AND)
results[0].fields[0].ranges(); // 필드별 하이라이트
```

## `whitespace` 모드

인스턴스 옵션 `whitespace`로 쿼리의 공백 처리 정책을 고른다:

| 값 | 동작 | 예 |
| --- | --- | --- |
| `"preserve"` | 공백을 일반 문자로 취급. target에 literal 공백이 있어야 매치 (VSCode 커맨드 검색 스타일) | `"a b"`는 `"a b"`에만 매치 |
| `"ignore"` (**기본값**) | 쿼리에서 공백을 제거 후 매칭 (VSCode 파일 검색 스타일) | `"a b"` ≡ `"ab"` |
| `"split"` | 공백으로 토큰 분리 → **순서 무관 AND**. 모든 토큰이 매치되어야 hit | `"제목 멋진"` ≡ `"멋진 제목"` |

`literal: true` 경로(raw substring)는 whitespace 옵션을 무시한다.

## `strict` 모드

기본(`strict: false`)은 모든 한글 grapheme을 관대하게 매칭해 IME 타이핑 여정을 수용한다
(`"갑"` → `"가방"`, `"막엲ㄱ"` → `"막연하게"`).

`strict: true`면 모음이 포함된 쿼리 grapheme은 target 음절과 자모 시퀀스가 정확히 일치해야
매치된다 (tail spill 금지 + 잉여 자모 금지). 초성-only grapheme과 non-Hangul은 영향받지 않는다.

```ts
const searcher = createSearcher(items, { strict: true });
```

## 옵션 위치 규칙

옵션의 위치가 곧 의미다:

- **`SearcherOptions`** (인스턴스 단위 정책, `createSearcher`에 전달): `key`, `target`, `fields`,
  `strict`, `whitespace`, `scoring`, `score`, `tiebreakKey`.
  한 번 만든 searcher는 동일 정책으로 모든 호출을 처리한다. 다른 정책이 필요하면 새 인스턴스.
- **`SearchResultOptions`** (per-call, `search`/`scan`에 전달): `limit`, `literal`, `filter`.

```ts
searcher.search("ㅍㅇ", { limit: 20 });
searcher.search("정확한 문자열", { literal: true }); // raw substring 매치
searcher.search("ㅅ", { filter: (item) => item.group === "file" }); // 매칭 비용 자체를 스킵
```

`filter`로 키 입력 간 세션 재사용을 유지하려면 **동일한 함수 참조**를 유지할 것 (그룹별로 memoize).
잘못된 위치에 옵션을 넘기면 dev 모드에서 `console.warn`이 뜬다.

## `scan()` 커서 — 취소·양보 가능한 스캔

`search()`는 `scan()`의 축약이다. 큰 리스트를 워커에서 돌리거나 정확한 전체 매치 수(`total`)가
필요하면 pull 기반 커서를 직접 쓴다:

```ts
const cursor = searcher.scan("ㅍㅇ", { limit: 50 });
cursor.next(256); // 256개 엔트리만 평가하고 반환. 완료 시 true
cursor.processed; // 진행률 UI용
cursor.results(); // 현재까지의 부분 snapshot (score desc)
```

커서를 버리면 그게 곧 취소다 — 세션 커밋은 스캔 **완료 시에만** 일어나므로 중단된 스캔이
이후 쿼리를 오염시키는 일은 구조적으로 불가능하다. async 래핑 레시피:

```ts
async function searchAsync(searcher, q, { limit, filter, signal, chunk = 256 } = {}) {
    const cursor = searcher.scan(q, { limit, filter });
    while (!cursor.next(chunk)) {
        if (signal?.aborted) return null; // 커서 버림 = 취소. 세션 오염 없음
        await new Promise((r) => setTimeout(r)); // event loop 양보
    }
    return { results: cursor.results(), total: cursor.total };
}
```

## IndexedDB 영속화

`preprocessTarget`의 결과(`Target`)는 모든 필드가 `string | number | TypedArray`라
`structuredClone`/IDB에 그대로 저장된다. atom ID는 순수함수로 산출되므로 세션·인스턴스 간
자동 일치 — 별도 매핑 저장이 필요 없다.

```ts
import { PREPROCESS_VERSION, createSearcher, preprocessTarget } from "fuzzly";

// 저장: Target을 아이템별로, PREPROCESS_VERSION은 스토어 단위로 딱 한 번 (meta 레코드)
await db.put("meta", { preprocessVersion: PREPROCESS_VERSION });
await db.put("targets", { id: item.id, target: preprocessTarget(item.title) });

// 로드: 버전이 일치하면 prebuilt Target으로 hydrate (재전처리 스킵)
const meta = await db.get("meta");
if (meta?.preprocessVersion === PREPROCESS_VERSION) {
    const searcher = createSearcher(items, { target: (item) => targetsById.get(item.id) });
} else {
    // 불일치 → 저장된 Target 전체 재전처리
}
```

`PREPROCESS_VERSION`은 Target 레이아웃/atom 인코딩 구조가 바뀔 때만 bump된다.
캐시 행마다 적지 말고 스토어 단위로 한 번만 기록하고, 무효화 판단은 소비자 몫이다.

## Scoring 커스터마이즈

스코어는 5축 가산 합이다 (anchorFill / positionZero / boundary / consecutive /
gapPenalty·targetLengthPenalty + per-grapheme bonus). 기본 가중치는 `SCORING` 상수이며
`scoring.weights`로 축별 오버라이드한다:

```ts
import { SCORING, createGraphemeBonuses, createSearcher } from "fuzzly";

const searcher = createSearcher(items, {
    key: (item) => item.title,
    scoring: {
        weights: { boundary: 40, gapPenalty: -5 }, // 나머지는 SCORING 기본값
    },
    tiebreakKey: (item) => item.lastUsedAt * -1, // score 동점 시 최근 사용 우선
});
```

특정 구간을 우대하려면 per-grapheme bonus를 쓴다. `scoring`이 함수 형태면
**entry 생성 시점(searcher 생성 / `add` / `replaceAll`)에 entry당 1회만 평가·캐시**되므로
(매 검색이 아님) target만의 순수함수여야 한다:

```ts
const searcher = createSearcher(items, {
    key: (item) => item.title,
    scoring: (target) => ({
        graphemeBonus: createGraphemeBonuses(target, [{ start: 0, end: 2, bonus: 100 }]),
    }),
});
```

`tiebreakKey`도 entry 생성 시 1회 평가·캐시되며, 정렬 순서는 **score desc → tiebreakKey asc**.

## React: `useFuzzlyInput`

IME composition을 추적하는 uncontrolled input 훅. `text`를 그대로 `search()`에 넘기면 된다:

```tsx
import { useFuzzlyInput } from "fuzzly/react";

function Palette() {
    const { text, ref, reset } = useFuzzlyInput<HTMLInputElement>();
    const results = searcher.search(text);
    return <input ref={ref} />;
}
```

`isComposing`/`composingIndex`도 노출되지만 매칭 파이프라인에는 불필요하다 (lenient 매칭이
IME 중간상태를 기본으로 수용). composition caret 표시 등 UI 신호용이다.
React는 optional peer dependency — `fuzzly/react`를 import하지 않으면 필요 없다.

## Low-level API

searcher 없이 매칭 파이프라인을 직접 조합할 수도 있다:

| 함수 | 설명 |
| --- | --- |
| `buildQuery(input, { whitespace? })` | 쿼리 문자열 → `Query` (grapheme·자모 분해) |
| `preprocessTarget(input)` | 대상 문자열 → `Target` (flat typed array, 재사용·직렬화 가능) |
| `matchBest(query, target, { scoring?, strict? })` | DP 기반 최적 매치. `MatchResult \| null` (score 포함) |
| `matchLiteral(literal, target)` | raw substring 매치 (best occurrence + 간이 score) |
| `matchFields(query, fields, { scoring?, strict? })` | 토큰 단위 cross-field AND. `FieldsMatchResult \| null` |
| `buildMatchRanges(hitMaps, target)` | `MatchResult.indices` 배열들 → 하이라이트 범위 `MatchRange[]` |
| `segmentByRanges(text, ranges)` | 원문 + `MatchRange[]` → `{ text, matched }[]` 렌더링 조각 |

```ts
import { buildMatchRanges, buildQuery, matchBest, preprocessTarget } from "fuzzly";

const target = preprocessTarget("인터스텔라");
const result = matchBest(buildQuery("ㅇㅌㄹ"), target);
if (result) {
    const ranges = buildMatchRanges([result.indices], target);
}
```

`matchBest`/`matchFields`를 직접 호출하는 경로는 세션 최적화·scoring 캐시가 없다 —
키스트로크 단위 검색이면 `createSearcher`를 쓰는 것이 낫다.

## 제한사항

- **65535자 제한**: `preprocessTarget`/`buildQuery`는 65535 UTF-16 code unit을 초과하는
  입력에 `RangeError`를 던진다 (내부 인덱스가 `Uint16Array`).
- **필드 concat 금지**: 멀티필드를 흉내내려고 여러 필드를 구분자로 이어 붙이지 말 것.
  개행 `\n`(U+000A)은 atom ID 10 = `ㅅ`과 충돌해 `"a\nb"`가 `ㅅ`에 매치되는 오염이 생긴다.
  여러 필드는 반드시 `fields`(멀티필드 searcher) 또는 `matchFields`로 처리한다.
- 제어문자(U+0000-U+001F)는 자모 atom ID 영역과 충돌하지만, 커맨드팔레트 텍스트에는
  등장하지 않으므로 실사용에서는 문제되지 않는다.

## License

ISC
