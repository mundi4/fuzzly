#!/bin/bash
# 배포 형태 확인: tools/pack-check.sh (npm run build 뒤에. release.sh가 부른다)
# 1) 배포 내용이 package.json, README, dist뿐인가 + exports가 가리키는 파일이 모두 있는가
# 2) 받는 쪽처럼 tarball을 빈 폴더에 설치해 본다: ESM import / CJS require가 되는가
set -euo pipefail
cd "$(dirname "$0")/.."

node -e '
const [{ files }] = JSON.parse(require("child_process").execSync("npm pack --dry-run --json", { encoding: "utf8" }));
const paths = files.map((f) => f.path);
const bad = paths.filter((p) => !/^(package\.json|README\.md|LICENSE.*|dist\/.+)$/.test(p));
if (bad.length) { console.error("배포 내용에 dist 밖 파일:", bad); process.exit(1); }
const pkg = require("./package.json");
const targets = new Set([pkg.main, pkg.module, pkg.types]);
for (const e of Object.values(pkg.exports)) for (const t of Object.values(e)) targets.add(t);
for (const t of targets) {
  const p = t.replace(/^\.\//, "");
  if (!paths.includes(p)) { console.error(`${p}가 없다`); process.exit(1); }
}
console.log(`배포 파일 ${files.length}개`);
'

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
npm pack --silent --pack-destination "$tmp" >/dev/null
cd "$tmp"
echo '{ "private": true, "type": "module" }' > package.json
npm install --silent --no-audit --no-fund ./fuzzly-*.tgz

node --input-type=module -e '
import assert from "node:assert/strict";
import { createSearcher } from "fuzzly";
import "fuzzly/score";
import "fuzzly/layout";
assert.ok(createSearcher(["파일 열기"]).search("ㅍㅇ").length === 1);
'
echo "ESM ok"
node -e '
const assert = require("node:assert/strict");
const { createSearcher } = require("fuzzly");
require("fuzzly/score");
require("fuzzly/layout");
assert.ok(createSearcher(["파일 열기"]).search("ㅍㅇ").length === 1);
'
echo "CJS ok"
