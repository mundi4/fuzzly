/**
 * Fuzzly Usage Examples
 * 
 * This file demonstrates various usage patterns of the Fuzzly library
 */

import { search, matches, getMatchRanges, type SearchOptions } from './src/search';

// ============================================================
// Example 1: Basic String Search
// ============================================================

console.log('=== Example 1: Basic String Search ===');
const fruits = ['사과', '바나나', '수박', '포도', '딸기'];
const results1 = search('사', fruits);
console.log('Query: "사"');
console.log('Results:', results1.map(r => r.item));

// ============================================================
// Example 2: Fuzzy Korean Search (초성)
// ============================================================

console.log('\n=== Example 2: Fuzzy Korean Search (초성) ===');
const items = ['안녕하세요', '반갑습니다', '고맙습니다'];
const results2 = search('ㅇㅎㅇ', items);
console.log('Query: "ㅇㅎㅇ"');
console.log('Results:', results2.map(r => r.item));

// ============================================================
// Example 3: Command Palette
// ============================================================

console.log('\n=== Example 3: Command Palette ===');

interface Command {
  id: string;
  name: string;
  description: string;
}

const commands: Command[] = [
  { id: 'file.open', name: '파일 열기', description: '파일을 엽니다' },
  { id: 'file.save', name: '파일 저장', description: '현재 파일을 저장합니다' },
  { id: 'file.close', name: '파일 닫기', description: '현재 파일을 닫습니다' },
  { id: 'edit.copy', name: '복사', description: '선택한 내용을 복사합니다' },
  { id: 'edit.paste', name: '붙여넣기', description: '클립보드 내용을 붙여넣습니다' },
];

const results3 = search('파열', commands, {
  keys: ['name', 'description']
});
console.log('Query: "파열"');
console.log('Results:', results3.map(r => `${r.item.name} (score: ${r.score.toFixed(2)})`));

// ============================================================
// Example 4: Search with Options
// ============================================================

console.log('\n=== Example 4: Search with Options ===');

const allCommands = [
  { name: '파일 열기', cmd: 'file.open' },
  { name: '파일 저장', cmd: 'file.save' },
  { name: '파일 닫기', cmd: 'file.close' },
  { name: '새 파일', cmd: 'file.new' },
];

const options: SearchOptions = {
  keys: ['name'],
  limit: 2,
  sort: true,
  threshold: 0.3
};

const results4 = search('파', allCommands, options);
console.log('Query: "파" with limit: 2');
console.log('Results:', results4.map(r => r.item.name));

// ============================================================
// Example 5: Using matches() Helper
// ============================================================

console.log('\n=== Example 5: Using matches() Helper ===');

const allItems = ['값어치', '가치', '감사', '강아지'];
const query = '가';

const filtered = allItems.filter(item => matches(query, item));
console.log(`Items matching "${query}":`, filtered);

// ============================================================
// Example 6: Highlighting Matches with getMatchRanges()
// ============================================================

console.log('\n=== Example 6: Highlighting Matches ===');

const text = '파일 열기';
const searchQuery = '파열';
const ranges = getMatchRanges(searchQuery, text);

if (ranges && ranges[0]) {
  console.log(`Text: "${text}"`);
  console.log(`Query: "${searchQuery}"`);
  console.log('Match ranges:', ranges[0]);
  
  // Simple highlight example
  let highlighted = text;
  ranges[0].reverse().forEach(range => {
    highlighted = 
      highlighted.slice(0, range.start) + 
      '[' + 
      highlighted.slice(range.start, range.end) + 
      ']' + 
      highlighted.slice(range.end);
  });
  console.log('Highlighted:', highlighted);
}

// ============================================================
// Example 7: Multi-token Search
// ============================================================

console.log('\n=== Example 7: Multi-token Search ===');

const documents = [
  { title: '안녕하세요 여러분', content: '이것은 테스트입니다' },
  { title: '반갑습니다', content: '안녕하세요' },
  { title: '테스트 문서', content: '여러분 안녕하세요' },
];

const results7 = search('안녕 여러', documents, {
  keys: ['title', 'content'],
  whitespaceMode: 'split' // Both tokens must match (AND logic)
});
console.log('Query: "안녕 여러" (both tokens must match)');
console.log('Results:', results7.map(r => r.item.title));

// ============================================================
// Example 8: Case Insensitive English Search
// ============================================================

console.log('\n=== Example 8: Case Insensitive English Search ===');

const actions = [
  { name: 'Open File', id: 1 },
  { name: 'CLOSE FILE', id: 2 },
  { name: 'Save File', id: 3 },
];

const results8 = search('open', actions, {
  keys: ['name'],
  caseSensitive: false
});
console.log('Query: "open" (case insensitive)');
console.log('Results:', results8.map(r => r.item.name));

// ============================================================
// Example 9: Literal Search with Quotes
// ============================================================

console.log('\n=== Example 9: Literal Search with Quotes ===');

const texts = ['값어치', '가치', '값'];
const results9a = search('값', texts); // Fuzzy search
const results9b = search('"값"', texts); // Literal search

console.log('Fuzzy search "값":', results9a.map(r => r.item));
console.log('Literal search "값":', results9b.map(r => r.item));

// ============================================================
// Example 10: Complex Object Search with Function Keys
// ============================================================

console.log('\n=== Example 10: Complex Object Search ===');

interface Article {
  title: string;
  tags: string[];
  author: { name: string };
}

const articles: Article[] = [
  {
    title: '타입스크립트 입문',
    tags: ['typescript', 'programming'],
    author: { name: '김철수' }
  },
  {
    title: '자바스크립트 기초',
    tags: ['javascript', 'web'],
    author: { name: '이영희' }
  },
  {
    title: '프로그래밍 패턴',
    tags: ['design', 'patterns'],
    author: { name: '박민수' }
  }
];

const results10 = search('타입', articles, {
  keys: [
    'title',
    (article) => article.tags.join(' '),
    (article) => article.author.name
  ]
});
console.log('Query: "타입"');
console.log('Results:', results10.map(r => r.item.title));

// ============================================================
// Example 11: Sorting and Scoring
// ============================================================

console.log('\n=== Example 11: Sorting and Scoring ===');

const words = ['가', '가나', '가나다', '가나다라'];
const results11 = search('가', words, { sort: true });

console.log('Query: "가" (sorted by relevance)');
results11.forEach(r => {
  console.log(`  ${r.item} - score: ${r.score.toFixed(3)}`);
});

console.log('\n✅ All examples completed!');
