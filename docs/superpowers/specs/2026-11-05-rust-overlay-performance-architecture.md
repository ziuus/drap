# Specification: High-Performance Native Rust Overlay & Sub-4ms Rendering Engine

**Date**: 2026-11-05  
**Topic**: Desktop Overlay Performance Optimization & Native Rust Architecture  
**Status**: Approved by User  
**Target File(s)**: `overlay.py`, `crates/drap-overlay/Cargo.toml`, `crates/drap-overlay/src/main.rs`, `run.sh`, `bin/drap.js`

---

## 1. Objective & Problem Statement
Profiling revealed that the current overlay animation was taking **67.47 ms per frame (14.8 FPS)** during full-screen drop confirmation because Cairo's CPU software rasterizer was dynamically calculating `cairo.RadialGradient(0, 0, 10, 0, 0, 2400)` across 2.07 million pixels every single frame. Furthermore, the Python PyGObject runtime consumes ~120 MB of RAM.

The goal is two-fold:
1. **Immediate 144+ FPS Rendering Fix**: Eliminate all dynamic CPU radial gradients during animation by pre-baking the atmospheric flood wash directly into hardware-blitted volumetric textures.
2. **Native Rust Overlay Binary (`drap-overlay`)**: Replace Python PyGObject with a compiled Rust binary using `gtk4-layer-shell`, Tokio async WebSockets, and zero-overhead memory management, reducing RAM from ~120 MB to ~14 MB and guaranteeing locked 144–240 FPS.

---

## 2. Rendering Optimization Architecture

### 2.1 Elimination of Dynamic CPU Gradients
- **Old Bottleneck**: In `_draw_fullscreen_confirm_wave`, creating a dynamic 2400px `cairo.RadialGradient` consumed 48.81 ms/frame on CPU.
- **Optimized Model**:
  - The atmospheric flood wash, volumetric prismatic dispersion, and origin corona are pre-baked into dedicated high-resolution off-screen textures during startup.
  - During the animation, frames perform only a scaled affine transform and bilinear texture blit (`cairo.SurfacePattern`).
  - **Benchmark Target**: Frame time drops from **67.47 ms down to < 4.0 ms (250+ FPS)**.

### 2.2 Native Rust Binary Architecture (`crates/drap-overlay`)
- **Language**: Rust (Edition 2021, Compiler: rustc 1.99.1).
- **Core Dependencies**:
  - `gtk4` & `gtk4-layer-shell`: Native Wayland layer-shell protocol bindings.
  - `cairo-rs`: Hardware-composited vector blitting.
  - `tokio` & `tokio-tungstenite`: Asynchronous background WebSocket client with zero GIL or main-thread latency.
  - `glib`: Thread-safe cross-context dispatching to GTK main loop via `glib::idle_add_local`.
- **Resource Targets**:
  - **Memory (RSS)**: $\le 16\text{ MB}$ (compared to ~120 MB in Python).
  - **Idle CPU**: Exactly **0.00%** (no active tick callbacks when idle).
  - **Startup Latency**: $\le 10\text{ ms}$.

---

## 3. Protocol & Feature Parity

The native Rust overlay will be a 100% drop-in replacement maintaining full protocol parity:
1. **WebSocket JSON Events**:
   - `drag_move`: coordinates, edge, corner, velocity, proximity.
   - `drag_drop` / `file_uploaded`: drop card filename, file size, origin edge/coord.
   - `video_resume`: video handoff portal surge.
   - `set_effect`: runtime theme switching (`aurora`, `plasma`, `solar`, `liquid`).
2. **Visual Fidelity**:
   - Drooop ethereal chromatic bloom matching the Tornike demo photo.
   - Frosted glass drop card with glassmorphism border and typography.
   - Click-through input passthrough mask via `cairo::Region::create()`.

---

## 4. Integration & Launch Strategy
- Build output placed in `bin/drap-overlay`.
- `run.sh` updated to inspect `bin/drap-overlay`:
  - If executable exists: launches `bin/drap-overlay` directly.
  - Fallback: launches `python3 overlay.py` if binary is not yet compiled.
- CLI commands (`drap test`, `drap on`, `drap restart`) operate seamlessly with either binary.

---

## 5. Verification Plan
1. **Benchmark Verification**: Measure render time of the pre-baked texture surge in Python and Rust, confirming frame time $\le 4.0\text{ ms}$ (locked $\ge 144\text{ FPS}$).
2. **Rust Compilation**: Verify clean compilation with `cargo build --release` (0 errors, 0 warnings).
3. **RAM Measurement**: Confirm memory usage with `ps -o rss,comm` $\le 20\text{ MB}$.
4. **Live E2E Verification**: Trigger `drap test left` and `drap test right` to verify visual smoothness on the live display.
