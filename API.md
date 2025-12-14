# Fuzzly API Documentation

Fuzzly는 한글 커맨드 팔레트를 위한 유연한 퍼지 검색 라이브러리입니다.

## 설치

```bash
npm install fuzzly
```

## 기본 사용법

### 간단한 문자열 검색

```typescript
import { search } from 'fuzzly';

const items = ['값어치', '가치', '감사합니다'];
const results = search('값', items);

console.log(results);
// [
//   { item: '값어치', score: 0.95, matches: [...], index: 0 }
// ]
```

### 객체 배열 검색

```typescript
import { search } from 'fuzzly';

const commands = [
  { name: '파일 열기', command: 'file.open' },
  { name: '파일 닫기', command: 'file.close' },
  { name: '새 파일', command: 'file.new' }
];

const results = search('파열', commands, {
  keys: ['name']
});

// '파일 열기'를 찾습니다
console.log(results[0].item.name); // '파일 열기'
```

## Public API

### `search<T>(query: string, items: T[], options?: SearchOptions): SearchResult<T>[]`

메인 검색 함수입니다. 아이템 배열에서 쿼리와 매칭되는 항목을 찾습니다.

**Parameters:**
- `query`: 검색어 문자열
- `items`: 검색 대상 배열
- `options`: 검색 옵션 (선택)

**Returns:** 검색 결과 배열, 관련도순으로 정렬됨

**Example:**
```typescript
const results = search('ㅇㅎㅇ', ['안녕하세요', '반갑습니다']);
```

### `matches<T>(query: string, item: T, options?: SearchOptions): boolean`

단일 아이템이 쿼리와 매칭되는지 빠르게 확인합니다.

**Example:**
```typescript
const items = ['값어치', '가치', '감사'];
const filtered = items.filter(item => matches('값', item));
```

### `getMatchRanges<T>(query: string, item: T, options?: SearchOptions): MatchRange[] | null`

단일 아이템에서 매칭된 위치 정보만 가져옵니다. 하이라이트 표시에 유용합니다.

**Example:**
```typescript
const ranges = getMatchRanges('파열', '파일 열기');
// 매칭된 범위를 사용해 텍스트 하이라이트
```

## SearchOptions

검색 동작을 커스터마이즈하는 옵션들:

```typescript
interface SearchOptions {
  keys?: string[] | ((item: any) => string)[];
  allowTailSpillover?: boolean;
  whitespaceMode?: 'boundary' | 'split' | 'literal';
  threshold?: number;
  sort?: boolean;
  limit?: number;
  caseSensitive?: boolean;
}
```

### `keys`

검색할 필드를 지정합니다. 문자열 배열이나 함수 배열을 사용할 수 있습니다.

```typescript
// 문자열 키
search('query', items, { keys: ['name', 'description'] });

// 함수 키
search('query', items, {
  keys: [
    'name',
    (item) => item.tags.join(' ')
  ]
});
```

### `allowTailSpillover`

받침이 다음 글자의 초성으로 넘어가는 것을 허용할지 여부입니다. 타이핑 중 부분 입력에 유용합니다.

- **기본값:** `true`
- **예시:** `allowTailSpillover: true`일 때, "값"이 "값어치"와 매칭됩니다.

```typescript
search('값', ['값어치'], { allowTailSpillover: true });
```

### `whitespaceMode`

쿼리의 공백을 어떻게 처리할지 결정합니다.

- `'split'` (기본값): 공백으로 쿼리를 나누어 여러 토큰으로 처리 (AND 로직)
- `'boundary'`: 공백을 경계로 처리 (spillover 불가)
- `'literal'`: 공백을 그대로 매칭할 문자로 처리

```typescript
// 'split' 모드: "파일"과 "열기" 둘 다 매칭되어야 함
search('파일 열기', items, { whitespaceMode: 'split' });

// 'literal' 모드: 정확히 "파일 열기" 문자열 찾기
search('파일 열기', items, { whitespaceMode: 'literal' });
```

### `threshold`

매칭 품질 임계값 (0-1). 이 값보다 낮은 점수의 결과는 제외됩니다.

- **기본값:** `0` (모든 매칭 허용)
- **범위:** `0` (관대함) ~ `1` (엄격함)

```typescript
search('query', items, { threshold: 0.5 });
```

### `sort`

결과를 관련도순으로 정렬할지 여부입니다.

- **기본값:** `true`

```typescript
search('query', items, { sort: false }); // 원본 순서 유지
```

### `limit`

반환할 최대 결과 수입니다.

- **기본값:** `undefined` (모든 결과 반환)

```typescript
search('query', items, { limit: 10 }); // 상위 10개만 반환
```

### `caseSensitive`

영문 대소문자 구분 여부입니다.

- **기본값:** `false` (대소문자 구분 안 함)

```typescript
search('Open', items, { caseSensitive: false }); // 'open', 'OPEN', 'Open' 모두 매칭
```

## SearchResult

검색 결과 객체:

```typescript
interface SearchResult<T> {
  item: T;                                    // 매칭된 아이템
  score: number;                              // 매칭 점수 (0-1, 높을수록 좋음)
  matches: Array<MatchRange[] | undefined>;   // 필드별 매칭 범위
  index: number;                              // 원본 배열의 인덱스
}
```

### 매칭 범위를 사용한 하이라이트 예시

```typescript
const results = search('파열', ['파일 열기']);
const result = results[0];

if (result.matches[0]) {
  const text = result.item;
  const ranges = result.matches[0];
  
  // ranges를 사용해 하이라이트 처리
  ranges.forEach(range => {
    console.log(`매칭: ${text.slice(range.start, range.end)}`);
  });
}
```

## 고급 기능

### 리터럴 검색

따옴표로 감싸면 리터럴 검색이 됩니다:

```typescript
search('"값"', ['값어치', '가치']); // 정확히 "값" 문자열만 찾기
```

### 초성 검색

한글 초성으로 검색할 수 있습니다:

```typescript
search('ㅇㅎㅇ', ['안녕하세요']); // 매칭됨
search('ㄱㄴㄷ', ['가나다라']); // 매칭됨
```

### 복합 객체 검색

여러 필드와 함수를 조합해 검색할 수 있습니다:

```typescript
interface Command {
  name: string;
  tags: string[];
  metadata: { category: string };
}

const results = search('query', commands, {
  keys: [
    'name',
    (cmd) => cmd.tags.join(' '),
    (cmd) => cmd.metadata.category
  ]
});
```

## Low-level API

더 세밀한 제어가 필요한 경우 저수준 API를 사용할 수 있습니다:

```typescript
import {
  buildFuzzyQuery,
  extractStrokes,
  matchFuzzyStrokes,
  matchLiteral,
  buildMatchRanges
} from 'fuzzly';

// 1. 쿼리 빌드
const query = buildFuzzyQuery('값');

// 2. 텍스트를 스트로크로 변환
const strokes = extractStrokes('값어치');

// 3. 매칭 수행
const matches = matchFuzzyStrokes(query, [strokes]);

// 4. 매칭 범위 생성
const ranges = buildMatchRanges([matches], [strokes]);
```

대부분의 경우 고수준 `search()` 함수를 사용하는 것이 권장됩니다.

## 사용 예시

### 커맨드 팔레트

```typescript
import { search } from 'fuzzly';

const commands = [
  { id: 'file.open', name: '파일 열기' },
  { id: 'file.save', name: '파일 저장' },
  { id: 'edit.copy', name: '복사' },
  { id: 'edit.paste', name: '붙여넣기' }
];

function searchCommands(query: string) {
  return search(query, commands, {
    keys: ['name'],
    limit: 5,
    sort: true
  });
}

// 사용
const results = searchCommands('파저');
// '파일 저장'이 최상단에 나옴
```

### 자동완성

```typescript
import { search } from 'fuzzly';

function autocomplete(query: string, items: string[]) {
  if (!query) return items.slice(0, 10);
  
  return search(query, items, {
    limit: 10,
    threshold: 0.3,
    sort: true
  }).map(r => r.item);
}
```

### 필터링

```typescript
import { matches } from 'fuzzly';

const allItems = ['값어치', '가치', '감사', '강아지'];
const query = '가';

const filtered = allItems.filter(item => matches(query, item));
```

## TypeScript 지원

Fuzzly는 완전한 TypeScript 지원을 제공합니다:

```typescript
import { search, SearchOptions, SearchResult } from 'fuzzly';

interface MyItem {
  id: number;
  name: string;
}

const items: MyItem[] = [
  { id: 1, name: '항목1' },
  { id: 2, name: '항목2' }
];

const results: SearchResult<MyItem>[] = search('항목', items, {
  keys: ['name']
});
```

## 성능 팁

1. **객체 검색 시 `keys` 옵션 사용**: 검색할 필드를 명시하면 불필요한 검색을 피할 수 있습니다.
2. **`limit` 옵션 활용**: 많은 결과가 예상되는 경우 limit를 설정하세요.
3. **`sort: false` 고려**: 정렬이 필요없다면 비활성화해 성능을 향상시킬 수 있습니다.
4. **`threshold` 조정**: 적절한 임계값으로 관련성 낮은 결과를 필터링하세요.

## 라이선스

ISC
