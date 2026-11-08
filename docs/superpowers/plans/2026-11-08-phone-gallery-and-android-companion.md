# Phone Gallery UX and Native Android Companion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide full phone gallery access for Drap through both an enhanced mobile PWA gallery importer with persistent IndexedDB caching and a native Android Companion APK (`drap-android`) that reads real device storage (`DCIM/Camera`) automatically.

**Architecture:**
1. **Web PWA Mobile Experience**:
   - Prominent "Sync Phone Gallery" card with multi-file picker for photos, videos, and camera roll.
   - Persistent client-side IndexedDB caching (`idb_drap_vault`) so picked gallery items remain available across browser refreshes and sessions.
   - Visual category segregation (Photos, Videos, Camera Roll, Desktop Shares).
   - Full drag-and-flick continuity integration with speculative pre-upload.
2. **Native Android Companion App (`android/`)**:
   - Kotlin/Android Gradle project requesting `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` / `READ_EXTERNAL_STORAGE`.
   - `ContentResolver` scanner querying `MediaStore.Images.Media.EXTERNAL_CONTENT_URI` to list real device camera photos with thumbnails.
   - Local network discovery for Drap daemon (`http://<ip>:8080/api/status`).
   - One-tap / swipe-to-desktop transfer to beam full-resolution photos directly to `~/Downloads/drap_received`.
3. **CI/CD APK Build**:
   - GitHub Actions workflow (`.github/workflows/android.yml`) to compile `drap-companion.apk` automatically.

---

### Task 1: Enhance Mobile Web PWA Gallery Importer & Persistent Storage
- [ ] In `client/index.html`, add a prominent "Import from Phone Gallery" / "Select Camera Roll" banner when opening the library.
- [ ] In `client/app.js`, enhance `handleFilePickerSelection` to store selected photos and videos into IndexedDB with rich metadata (name, size, type, data URL / blob, timestamp).
- [ ] Load and display all persisted gallery files on portal startup, sorting by recency.
- [ ] Add an "Add Photos" / "Clear Stored Photos" action in the library toolbar.
- [ ] Test in mobile viewport to verify smooth one-tap selection and card persistence.

### Task 2: Scaffold Native Android Companion App (`android/`)
- [ ] Create Android project structure under `android/`:
  - `build.gradle.kts`, `settings.gradle.kts`, `gradle/wrapper/`
  - `app/build.gradle.kts`, `app/src/main/AndroidManifest.xml`
- [ ] Configure permissions:
  - `android.permission.INTERNET`
  - `android.permission.ACCESS_NETWORK_STATE`
  - `android.permission.READ_MEDIA_IMAGES`
  - `android.permission.READ_MEDIA_VIDEO`
  - `android.permission.READ_EXTERNAL_STORAGE`
- [ ] Implement `GalleryScanner.kt` to query `MediaStore.Images.Media.EXTERNAL_CONTENT_URI`.
- [ ] Implement `DrapSender.kt` to transmit selected media to `http://<desktop-ip>:8080/api/upload` or `/api/commit_upload`.
- [ ] Implement `MainActivity.kt` with a modern dark tactile gallery grid showing phone photos and desktop beam button.

### Task 3: Add GitHub Actions Android Build Workflow (`.github/workflows/android.yml`)
- [ ] Create `.github/workflows/android.yml`.
- [ ] Setup Java 17 and Android SDK.
- [ ] Build `assembleDebug` / `assembleRelease` APK.
- [ ] Upload `drap-companion-debug.apk` as a workflow artifact and attach to GitHub releases.

### Task 4: Verification and Live Testing
- [ ] Verify PWA mobile gallery selection and persistence in `client/app.js`.
- [ ] Verify local Python/Uvicorn server accepts uploads from both PWA and native companion.
- [ ] Commit and push changes to GitHub.
