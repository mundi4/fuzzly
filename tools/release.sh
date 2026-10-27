#!/bin/bash
# 배포 태그를 만든다: tools/release.sh <X.Y.Z>
# 받는 쪽은 태그로 설치하고 빌드하지 않는다(prepare 없음). 그래서 태그 커밋에 dist를 넣는다:
# 지금 커밋 위에 version과 dist만 더한 릴리스 커밋을 따로 만들고 v<X.Y.Z> 태그를 단다. 브랜치는 움직이지 않는다(릴리스 커밋은 태그로만 닿는다)
# push는 하지 않는다. 올리는 것은 git push origin v<X.Y.Z>
set -euo pipefail
cd "$(dirname "$0")/.."
v=${1:-}
[[ $v =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "사용: tools/release.sh X.Y.Z" >&2; exit 1; }
branch=$(git symbolic-ref -q --short HEAD) || { echo "브랜치 위에서 돌린다(detached HEAD)" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "커밋 안 된 변경이 있다" >&2; exit 1; }
[ -z "$(git ls-files --others --exclude-standard src)" ] || { echo "src에 git이 모르는 파일이 있다" >&2; exit 1; }
! git rev-parse -q --verify "refs/tags/v$v" >/dev/null || { echo "v$v 태그가 이미 있다" >&2; exit 1; }

npx tsc --noEmit
npm test
npm run build
bash tools/pack-check.sh

git checkout -q --detach
# 실패해도 원래 브랜치로 돌아간다(시작할 때 깨끗했으니 남는 변경은 이 스크립트가 만든 것뿐이다)
trap 'git checkout -qf "$branch"' EXIT
npm version "$v" --no-git-tag-version --allow-same-version >/dev/null
git add -f dist package.json package-lock.json
git commit -qm "release v$v"
git tag -a "v$v" -m "v$v"
echo "v$v → $(git rev-parse --short HEAD). 올리기: git push origin v$v"
