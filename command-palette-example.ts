/**
 * Real-world Command Palette Example
 * 
 * This example demonstrates how to use fuzzly in a command palette UI
 */

import { search, type SearchResult } from './src/search';

// ============================================================
// Define Command Structure
// ============================================================

interface Command {
  id: string;
  name: string;
  description: string;
  category: string;
  keywords: string[];
  icon?: string;
}

// ============================================================
// Sample Commands (like in VSCode or Sublime)
// ============================================================

const commands: Command[] = [
  // File operations
  {
    id: 'file.new',
    name: '새 파일',
    description: '새로운 파일을 만듭니다',
    category: '파일',
    keywords: ['생성', 'create', 'new'],
    icon: '📄'
  },
  {
    id: 'file.open',
    name: '파일 열기',
    description: '기존 파일을 엽니다',
    category: '파일',
    keywords: ['불러오기', 'open', 'load'],
    icon: '📂'
  },
  {
    id: 'file.save',
    name: '파일 저장',
    description: '현재 파일을 저장합니다',
    category: '파일',
    keywords: ['세이브', 'save'],
    icon: '💾'
  },
  {
    id: 'file.saveAs',
    name: '다른 이름으로 저장',
    description: '파일을 새 이름으로 저장합니다',
    category: '파일',
    keywords: ['save as', 'export'],
    icon: '💾'
  },
  
  // Edit operations
  {
    id: 'edit.copy',
    name: '복사',
    description: '선택한 내용을 복사합니다',
    category: '편집',
    keywords: ['copy', 'duplicate'],
    icon: '📋'
  },
  {
    id: 'edit.paste',
    name: '붙여넣기',
    description: '클립보드 내용을 붙여넣습니다',
    category: '편집',
    keywords: ['paste', 'insert'],
    icon: '📋'
  },
  {
    id: 'edit.find',
    name: '찾기',
    description: '텍스트를 검색합니다',
    category: '편집',
    keywords: ['search', 'find'],
    icon: '🔍'
  },
  {
    id: 'edit.replace',
    name: '찾아서 바꾸기',
    description: '텍스트를 찾아 다른 텍스트로 바꿉니다',
    category: '편집',
    keywords: ['replace', 'change'],
    icon: '🔄'
  },
  
  // View operations
  {
    id: 'view.toggleSidebar',
    name: '사이드바 토글',
    description: '사이드바를 표시하거나 숨깁니다',
    category: '보기',
    keywords: ['sidebar', 'panel'],
    icon: '📱'
  },
  {
    id: 'view.fullscreen',
    name: '전체 화면',
    description: '전체 화면 모드로 전환합니다',
    category: '보기',
    keywords: ['fullscreen', 'maximize'],
    icon: '⛶'
  },
  
  // Git operations
  {
    id: 'git.commit',
    name: '커밋',
    description: '변경사항을 커밋합니다',
    category: 'Git',
    keywords: ['commit', 'save changes'],
    icon: '✓'
  },
  {
    id: 'git.push',
    name: '푸시',
    description: '변경사항을 원격 저장소로 푸시합니다',
    category: 'Git',
    keywords: ['push', 'upload'],
    icon: '⬆'
  },
  {
    id: 'git.pull',
    name: '풀',
    description: '원격 저장소에서 변경사항을 가져옵니다',
    category: 'Git',
    keywords: ['pull', 'fetch', 'download'],
    icon: '⬇'
  },
];

// ============================================================
// Command Palette Search Function
// ============================================================

function searchCommands(query: string): SearchResult<Command>[] {
  if (!query || query.trim() === '') {
    // Return all commands when query is empty
    return commands.map((cmd, index) => ({
      item: cmd,
      score: 1,
      matches: [],
      index
    }));
  }

  return search(query, commands, {
    // Search across multiple fields
    keys: [
      'name',           // Primary: command name
      'description',    // Secondary: description
      'category',       // Category for filtering
      (cmd) => cmd.keywords.join(' ')  // Additional keywords
    ],
    
    // Sort by relevance (best matches first)
    sort: true,
    
    // Limit to top 10 results
    limit: 10,
    
    // Allow tail spillover for Korean typing
    allowTailSpillover: true,
    
    // Split query by spaces (multiple keywords)
    whitespaceMode: 'split',
    
    // Case insensitive for English
    caseSensitive: false,
    
    // Only show reasonably good matches
    threshold: 0.1
  });
}

// ============================================================
// Display Results (Simulated UI)
// ============================================================

function displayResults(query: string) {
  console.log('\n' + '='.repeat(60));
  console.log(`Search: "${query}"`);
  console.log('='.repeat(60));
  
  const results = searchCommands(query);
  
  if (results.length === 0) {
    console.log('No results found.');
    return;
  }
  
  results.forEach((result, index) => {
    const cmd = result.item;
    const scoreBar = '█'.repeat(Math.floor(result.score * 20));
    
    console.log(`\n${index + 1}. ${cmd.icon || '•'} ${cmd.name}`);
    console.log(`   ${cmd.description}`);
    console.log(`   Category: ${cmd.category} | Score: ${scoreBar} ${result.score.toFixed(2)}`);
  });
}

// ============================================================
// Example Searches
// ============================================================

console.log('\n🎯 Fuzzly Command Palette Demo\n');

// Example 1: Korean fuzzy search
displayResults('파열');  // Should find "파일 열기"

// Example 2: Korean initial consonant search (초성)
displayResults('ㅍㅇㅂ');  // Should find "파일" related commands

// Example 3: English search
displayResults('save');  // Should find save-related commands

// Example 4: Multi-word search
displayResults('파일 저장');  // Should find "파일 저장"

// Example 5: Category search
displayResults('git');  // Should find Git commands

// Example 6: Mixed Korean/English
displayResults('복 copy');  // Should find "복사" (copy)

// Example 7: Partial typing
displayResults('ㅅㅇㄷ');  // Should find "사이드바"

// Example 8: Description search
displayResults('검색');  // Should find commands with "검색" in description

console.log('\n' + '='.repeat(60));
console.log('✅ Demo completed!');
console.log('='.repeat(60) + '\n');

// ============================================================
// Real UI Integration Notes
// ============================================================

/*
To integrate this in a real UI (React, Vue, etc.):

1. Debounce the search input:
   ```typescript
   const debouncedSearch = debounce((query: string) => {
     const results = searchCommands(query);
     setResults(results);
   }, 150);
   ```

2. Highlight matched text using result.matches:
   ```typescript
   function highlightMatches(text: string, ranges: MatchRange[]) {
     // Split text into highlighted and non-highlighted segments
     // Render with different styles
   }
   ```

3. Handle keyboard navigation:
   ```typescript
   function handleKeyDown(e: KeyboardEvent) {
     if (e.key === 'ArrowDown') selectNext();
     if (e.key === 'ArrowUp') selectPrev();
     if (e.key === 'Enter') executeSelected();
   }
   ```

4. Execute command on selection:
   ```typescript
   function executeCommand(cmd: Command) {
     console.log('Executing:', cmd.id);
     // Route to actual command implementation
   }
   ```
*/

// ============================================================
// Performance Tips
// ============================================================

/*
For optimal performance:

1. Cache extracted strokes:
   - If searching the same dataset repeatedly
   - Pre-extract strokes on data load

2. Virtualize long lists:
   - Only render visible results
   - Use libraries like react-window

3. Consider fuzzy threshold:
   - Higher threshold = fewer results = faster
   - Balance between coverage and performance

4. Lazy load descriptions:
   - Only include critical fields in initial search
   - Load full details on selection

5. Worker threads for large datasets:
   - Move search to Web Worker
   - Keep UI responsive during search
*/
