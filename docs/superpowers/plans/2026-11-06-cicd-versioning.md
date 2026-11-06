# CI/CD and Version Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish an automated, enterprise-grade GitHub Actions CI/CD pipeline, unified version management across Rust and Node/Python, and automated release packaging.

**Architecture:** 
1. Single source of truth version management synchronized across `package.json` and `crates/drap-overlay/Cargo.toml`.
2. Multi-stage GitHub Actions CI workflow verifying Rust GTK4 layer-shell compilation, Python test suites, and client asset integrity on every PR and push.
3. Automated GitHub Release workflow building stripped Linux x86_64 binaries, packaging release tarballs with checksums, and publishing GitHub Releases on `v*` git tags.
4. Upgraded `drap update` and `drap version` CLI commands in `bin/drap.js`.

**Tech Stack:** GitHub Actions, Rust (Cargo), Node.js, Python 3, bash

## Global Constraints
- Must support Linux Wayland (GTK4 + gtk4-layer-shell).
- No broken dependencies in CI runners (Ubuntu 24.04 / 22.04 LTS runners with necessary GTK4 headers).
- Semantic Versioning (SemVer) standard `vMAJOR.MINOR.PATCH`.
- Safe backward-compatible updates in CLI.

---

### Task 1: Synchronize Project Versions & Add Version Bumper Script
- [ ] Align `package.json` and `crates/drap-overlay/Cargo.toml` to version `1.0.0`.
- [ ] Add `scripts/bump-version.sh` to update versions atomically, create commit, and create git tags.
- [ ] Add `drap version` / `drap -v` command in `bin/drap.js` displaying synchronized version, git commit hash, and rust binary version.
- [ ] Test `scripts/bump-version.sh` and verify all files reflect version `1.0.0`.

### Task 2: Create GitHub Actions CI Workflow (`.github/workflows/ci.yml`)
- [ ] Create `.github/workflows/ci.yml`.
- [ ] Define Rust GTK4 Layer Shell build job with system dependencies (`libgtk-4-dev`, `libgtk4-layer-shell-dev`, `libcairo2-dev`, `libglib2.0-dev`).
- [ ] Define Python backend validation job testing FastAPI endpoints, Zeroconf, and WebSocket handlers.
- [ ] Define Node.js CLI syntax check job.
- [ ] Validate workflow syntax and YAML structure.

### Task 3: Create GitHub Actions Release Workflow (`.github/workflows/release.yml`)
- [ ] Create `.github/workflows/release.yml` triggered on push of tags matching `v*`.
- [ ] Configure release build step for Rust `drap-overlay` with `--release` and `strip`.
- [ ] Generate release tarball `drap-v${VERSION}-linux-x86_64.tar.gz` containing binaries, client, server, and installation scripts.
- [ ] Generate SHA256 checksums (`sha256sum`).
- [ ] Integrate GitHub Release creation with attached release tarball and checksum.

### Task 4: Upgrade `drap update` in `bin/drap.js`
- [ ] Update `drap update` to display current vs latest git release tag.
- [ ] Add clean fast-forward pull, dependency re-verification, and binary check.
- [ ] Verify `node bin/drap.js version` and `node bin/drap.js --version` output correctly.

### Task 5: Initial Tagging, Verification, and Commit
- [ ] Run local tests to ensure clean builds.
- [ ] Create initial git tag `v1.0.0`.
- [ ] Commit all changes and push to GitHub repository.
