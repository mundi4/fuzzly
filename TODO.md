# TODO

## API 재설계

### [ ] SearchOptions → SearcherOptions 이관
`scoring`, `score`, `spillMode`, `whitespace`를 `createSearcher`에 넘기도록
이동. 세션 연속성에 영향을 주는 값이므로 call-site가 아니라 searcher 생성
시점에 고정하는 것이 맞다. 변경 시엔 새 searcher를 만든다.

- `SearcherOptions<T>`에 `scoring`, `score`, `spillMode`, `whitespace` 추가
- `createSearcher` 내부 세션 리셋 로직에서 해당 필드 비교 제거
- `SearchOptions`는 `{ limit?, literal?, composingIndex? }`로 축소
- 마이그레이션 노트: 기존 `searcher.search(q, { scoring })` 호출부
  (`test/scoring.test.ts` 등) 재작성 필요

### [ ] literal을 search-time 인자로
`literal`은 쿼리 해석 모드라 per-call이 자연스럽다. 위 축소된
`SearchOptions` 안에 남긴다.

### [ ] composingIndex를 options 객체로 흡수
현재 `search(query, options, composingIndex)` 3번째 positional 인자를
`search(query, { literal?, limit?, composingIndex? })`로 통일.
호출부 가독성과 일관성 향상.

### [ ] score vs scoring 이름·문서 정리
- `scoring` → `scoringConfig` (DP 내부 가중치임을 명확히)
- `score` → `rankBy` 또는 `scoreFn` (item 간 최종 정렬 콜백임을 명확히)
- `types.ts` JSDoc에 두 필드 역할 차이 예제 추가
- `CLAUDE.md` Public API 섹션도 동기화

### [ ] 콜백 필드 네이밍 통일
- `SearcherOptions.key` → `getKey` (또는 `keyOf`)
- 위 `rankBy`/`scoreFn` 결정과 일관된 네이밍 규칙 채택
- `README`/`CLAUDE.md` 예제 전체 동기화

### [ ] WhitespaceMode 값 리네임 + 기본값 변경
- `WhitespaceMode`: `"literal" | "ignore"` → `"preserve" | "ignore"`
  - 근거: `SearchOptions.literal`(substring 모드 플래그, 유지)과 이름 충돌
    제거. `preserve`/`ignore` 쌍이 행위 대칭적("공백을 남긴다/버린다")
- 기본값 `"literal"` → `"ignore"`로 변경 (퍼지 검색 UX 상 "ab cd" ≡ "abcd"가
  기대 동작). 기존 VSCode 커맨드 스타일이 필요하면 명시적으로 `"preserve"`
  지정
- 영향 파일: `src/types.ts`, `src/buildQuery.ts`(default 처리),
  `src/createSearcher.ts`(세션 비교 값), `CLAUDE.md`, 테스트 전반
- `SearchOptions.literal`(substring 플래그)은 **그대로 유지**

### [ ] caller API에서 낯선 용어/내부 개념 노출 최소화
caller는 원문 char index(UTF-16 offset)와 score/hit 여부만 알면 충분하다.
현재 public 표면에 구현 디테일이 다수 새어나와 있음. 아래 카테고리별로
`@internal` 마크, internal/ 이동, 혹은 export 중단을 검토한다.

**A. grapheme 좌표계**
- `MatchResult.indices`(grapheme index 배열) → char range로 변환해 제공.
  `MatchResult.ranges: MatchRange[]`를 기본 필드로 승격하고 `indices`는
  `@internal`로 격하 또는 제거
- `GraphemeIndices` 타입 export 제거
- `Query.graphemeIndexes`, `Target.graphemeIndexes` 필드 `@internal`
- `buildMatchRanges`는 고급 용도로만 남기고 caller는 `MatchResult.ranges`
  사용을 권장
- `composingIndex`는 char index 기반이므로 그대로 유지 OK

**B. atom / 자모 분해 내부**
- `Atoms`(Uint8Array alias) export 제거 후보
- `QueryGrapheme`(`atoms`, `vowelIndex`, `tailIndex`) → `@internal`.
  `Query.graphemes` 필드 자체를 내부로 숨기거나 elements 접근 금지
- `Target.atomsFlat`, `atomStarts`, `atomLens`, `vowelIdxs`, `tailIdxs`,
  `graphemeCount`, `boundaryFlags` → `@internal` (Target은 opaque handle로
  취급. 직렬화 필요 시 별도 `serializeTarget`/`deserializeTarget` API)
- `Query.atoms`(concatenated string) → `@internal`
- `normalizedInput` → `@internal`

**C. 한글-특수 튜닝 노브**
- `ScoringWeights.choseongWeaken` — "초성 약화"라는 개념 자체가 내부 DP의
  구현 디테일. 이름을 일반화하거나 고급 옵션으로 격하 (예: `advanced`
  하위 객체로)
- `ScoringWeights.tailSpillPenalty`, `SpillMode`의 "spill" 용어 —
  도메인-내부 개념. caller가 의도하는 것은 "finalized 음절을 얼마나
  엄격하게 매칭할 것인가"이므로 **strictness** 계열 용어로 재설계
  - `SpillMode` → `StrictnessMode` (혹은 `MatchStrictness`)
  - 옵션 이름 `spillMode` → `strictness`
  - `ScoringWeights.tailSpillPenalty` → `looseMatchPenalty` 등
    strictness-역(loose) 기준으로 재명명
  - 값(`"always"` / `"composing"` / `"composingOrLast"`)은 현재 "어느
    grapheme이 조합중인가"를 표현 → strictness 관점으로 재표현
    (예: `"strict"` / `"composingOnly"` / `"composingOrLast"`,
    기본값 의미 정합성 유지) — 구체 네이밍은 구현 단계에서 확정

**D. 원자 레지스트리 export**
- `hasDynamicAtoms` / `snapshotDynamicAtoms` / `restoreDynamicAtoms` —
  IDB 직렬화 caller에게 필요하지만 `atom`이라는 용어가 노출됨.
  `serializeRegistry` / `restoreRegistry` 등 중립 네이밍 고려

**E. MatchResult 메타데이터**
- `startsAtZero`, `runCount`, `boundaryHits`, `initialConsonantOnly` —
  대체로 유지하되 JSDoc에 caller 사용 예제 추가 (사실 caller가 직접 쓸
  일은 드물고 `score` 튜닝 시에만 필요 → `@internal`로 내릴지 검토)

**실행 원칙**
- 공개 표면은 "쿼리 문자열 입력 → 매치 여부 + char ranges + score" 외에는
  전부 advanced/internal로 내린다
- 사용자 문서에서 "grapheme", "atom", "choseong", "spill" 같은 용어를
  첫 학습 단계에서 만나지 않도록 README/CLAUDE.md 재구성

### [ ] 테스트에서 옵션값 명시 전달
모든 테스트가 현재 기본값에 암묵적으로 의존하고 있다. 기본값이 바뀌면
사일런트 회귀가 나므로, 각 테스트가 의도하는 옵션 값을 항상 명시하도록
수정한다.

- `test/**/*.test.ts` 전수 감사: `buildQuery`, `match`/`matchBest`,
  `searcher.search` 호출부마다 관련 옵션 (`whitespace`, `spillMode`,
  `composingIndex`, `literal`, `scoring`, `score` 등) 명시
- 특히 `whitespace` 기본값 전환 시 기존 테스트가 어느 값을 검증 중인지
  명시되어야 함
- 새 테스트 작성 규칙으로 문서화 (`CLAUDE.md`의 Conventions 섹션)

## 마이그레이션 체크리스트
- [ ] `test/createSearcher.test.ts`, `test/scoring.test.ts` 호출부 수정
- [ ] `test/**/*.test.ts` 전수 옵션 명시화
- [ ] `src/buildMatchRanges.ts` 사용처 조사 → `MatchResult`로 흡수 여부 결정
- [ ] `CLAUDE.md` Public API 블록 + WhitespaceMode 설명 갱신
- [ ] README 예제(있다면) 갱신
- [ ] breaking change이므로 메이저 버전 bump
