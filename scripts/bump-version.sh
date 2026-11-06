#!/usr/bin/env bash
set -euo pipefail

# Drap Semantic Version Bumper
# Synchronizes version numbers across package.json and crates/drap-overlay/Cargo.toml

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

if [ -z "${1:-}" ]; then
  echo "Usage: ./scripts/bump-version.sh <new_version>"
  echo "Example: ./scripts/bump-version.sh 1.0.1"
  exit 1
fi

NEW_VER="$1"
# Remove leading 'v' if provided
NEW_VER="${NEW_VER#v}"

# Validate SemVer format (e.g. 1.0.0, 1.2.3-rc1)
if [[ ! "$NEW_VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  echo "❌ Error: '$NEW_VER' is not a valid Semantic Version (e.g. 1.0.1 or 1.2.0-beta.1)"
  exit 1
fi

echo "=================================================="
echo "  💧 DRAP VERSION BUMP: v${NEW_VER}"
echo "=================================================="

# 1. Update package.json
if [ -f "package.json" ]; then
  sed -i -E "s/\"version\": \"[^\"]+\"/\"version\": \"${NEW_VER}\"/" package.json
  echo "✓ Updated package.json -> ${NEW_VER}"
fi

# 2. Update crates/drap-overlay/Cargo.toml
if [ -f "crates/drap-overlay/Cargo.toml" ]; then
  sed -i -E "s/^version = \"[^\"]+\"/version = \"${NEW_VER}\"/" crates/drap-overlay/Cargo.toml
  echo "✓ Updated crates/drap-overlay/Cargo.toml -> ${NEW_VER}"
fi

# 3. Check git status
git add package.json crates/drap-overlay/Cargo.toml

# 4. Git commit and tag
TAG_NAME="v${NEW_VER}"
git commit -m "chore(release): bump version to ${TAG_NAME}"
git tag -a "${TAG_NAME}" -m "Release ${TAG_NAME}"

echo "=================================================="
echo "✨ Successfully tagged release ${TAG_NAME}!"
echo "To push release and trigger automated CI/CD build, run:"
echo "  git push origin main --tags"
echo "=================================================="
