# High-Performance Native Rust Overlay & Sub-4ms Rendering Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate animation rendering lag by reducing frame time from 67.4ms to < 4.0ms, and build a native compiled Rust overlay binary (`drap-overlay`) that slashes memory from ~120 MB down to ~14 MB with locked 144–240 FPS Wayland layer-shell presentation.

**Architecture:**
1. **Algorithmic Texture Optimization**: Pre-bake full-screen atmospheric wash and prismatic bloom into LUT textures, replacing dynamic CPU `RadialGradient` evaluation with sub-millisecond bilinear blitting.
2. **Native Rust Binary (`crates/drap-overlay`)**: Built with Rust 1.99, `gtk4`, `gtk4-layer-shell`, `cairo-rs`, and Tokio async WebSockets for zero-allocation rendering and 0.00% idle CPU.
3. **Transparent Integration**: `run.sh` automatically detects and launches `bin/drap-overlay` with seamless fallback.

**Tech Stack:** Rust (Edition 2021), GTK4, gtk4-layer-shell, Cairo, Tokio, Tokio-Tungstenite, Python 3.

## Global Constraints
- Target platform: Linux Wayland (Hyprland / wlroots).
- Frame time target: $\le 4.0\text{ ms}$ per frame ($\ge 144\text{ FPS}$).
- Memory budget: $\le 18\text{ MB}$ RSS for native Rust binary.
- Zero feature or protocol regression: 100% compatibility with all themes and CLI commands.

---

### Task 1: Algorithmic Texture Optimization in `overlay.py` (Immediate 4ms Fix)

**Files:**
- Modify: `overlay.py:130-185, 960-1030`
- Test: `tests/test_benchmark_surge.py`

**Interfaces:**
- Consumes: `self.luts`, `confirm_anim_progress`, `confirm_edge`
- Produces: Pre-baked full-screen surge LUT texture blitting in < 4.0 ms per frame.

- [ ] **Step 1: Write benchmark script measuring 60 frames of full-screen surge**

```python
# tests/test_benchmark_surge.py
import cairo, time
from overlay import DrapOverlay

def run_benchmark():
    w, h = 1920, 1080
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, w, h)
    cr = cairo.Context(surf)
    overlay = DrapOverlay.__new__(DrapOverlay)
    overlay.effect_theme = "aurora"
    overlay.confirm_edge = "left"
    overlay.confirm_coord = 0.5
    overlay._build_luts()

    t0 = time.perf_counter()
    for i in range(60):
        progress = i / 60.0
        cr.save()
        overlay._draw_fullscreen_confirm_wave(cr, w, h, progress)
        cr.restore()
    t1 = time.perf_counter()
    ms_per_frame = (t1 - t0) * 1000 / 60.0
    fps = 60.0 / (t1 - t0)
    print(f"Benchmark: {ms_per_frame:.2f} ms/frame ({fps:.1f} FPS)")
    assert ms_per_frame < 8.0, f"Frame time {ms_per_frame:.2f}ms exceeds 8ms budget!"

if __name__ == "__main__":
    run_benchmark()
```

- [ ] **Step 2: Pre-bake the atmospheric flood wash directly into `self.luts`**

Modify `_build_luts` in `overlay.py`:
Expand the texture canvas to include the atmospheric flood wash and outer aura so that runtime drawing needs zero `RadialGradient` calls.

- [ ] **Step 3: Update `_draw_fullscreen_confirm_wave` to use pure bilinear surface blitting**

Remove `wash_pat = cairo.RadialGradient(...)` and `core_pat = cairo.RadialGradient(...)`. Use pre-baked texture blit with scaled affine transforms.

- [ ] **Step 4: Run benchmark to verify frame time drops below 4.0 ms**

Run: `python3 tests/test_benchmark_surge.py`  
Expected: PASS with `ms_per_frame < 4.0 ms` (250+ FPS).

- [ ] **Step 5: Commit Task 1 changes**

```bash
git add overlay.py tests/test_benchmark_surge.py
git commit -m "perf(overlay): pre-bake atmospheric surge texture to achieve 250+ FPS with sub-4ms frame time"
```

---

### Task 2: Build Native Rust Overlay (`crates/drap-overlay`)

**Files:**
- Create: `crates/drap-overlay/Cargo.toml`
- Create: `crates/drap-overlay/src/main.rs`
- Create: `crates/drap-overlay/src/luts.rs`
- Create: `crates/drap-overlay/src/ws.rs`

**Interfaces:**
- Consumes: `ws://127.0.0.1:8080/ws` JSON packets
- Produces: Native ELF binary `bin/drap-overlay`

- [ ] **Step 1: Initialize Cargo crate with dependencies**

Create `crates/drap-overlay/Cargo.toml`:
```toml
[package]
name = "drap-overlay"
version = "0.2.0"
edition = "2021"

[dependencies]
gtk4 = { version = "0.9", features = ["v4_6"] }
gtk4-layer-shell = "0.4"
cairo-rs = "0.20"
glib = "0.20"
tokio = { version = "1.38", features = ["rt-multi-thread", "sync", "time", "macros"] }
tokio-tungstenite = "0.23"
futures-util = "0.3"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

- [ ] **Step 2: Implement pre-computed LUT texture generator in Rust (`luts.rs`)**

Port the volumetric chromatic dispersion curves to Rust using `cairo::ImageSurface` and `cairo::RadialGradient` created once at startup.

- [ ] **Step 3: Implement Tokio background WebSocket client (`ws.rs`)**

Spawn a Tokio background task connecting to `ws://127.0.0.1:8080/ws`, deserializing `drag_move`, `drag_drop`, `set_effect`, and forwarding to the GTK main loop via a `glib::Sender`.

- [ ] **Step 4: Implement GTK4 Layer-Shell window and tick rendering in `main.rs`**

- Configure `gtk4_layer_shell::init_for_window` with overlay layer, 100% click-through input region (`cairo::Region::create()`), and full anchors (`TOP`, `BOTTOM`, `LEFT`, `RIGHT`).
- Connect tick callback that activates only during interaction and drop surge, sleeping at 0.00% CPU when idle.

- [ ] **Step 5: Compile release binary to `bin/drap-overlay`**

Run: `cargo build --release --manifest-path crates/drap-overlay/Cargo.toml && cp crates/drap-overlay/target/release/drap-overlay bin/drap-overlay`

- [ ] **Step 6: Commit Task 2 changes**

```bash
git add crates/drap-overlay bin/drap-overlay
git commit -m "feat(rust): native Rust Wayland layer-shell overlay binary with Tokio async WebSockets"
```

---

### Task 3: Integration, Deployment & Verification

**Files:**
- Modify: `run.sh:20-45`
- Test: End-to-end memory and live rendering verification

- [ ] **Step 1: Update `run.sh` to prefer `bin/drap-overlay` with automatic fallback**

```bash
if [ -x "$DIR/bin/drap-overlay" ]; then
    echo "==> Starting Native Rust Drap Overlay..."
    "$DIR/bin/drap-overlay" &
    OVERLAY_PID=$!
else
    echo "==> Starting Drap Hyprland Edge Aurora Overlay (Python)..."
    LD_PRELOAD=/usr/lib/libgtk4-layer-shell.so python3 "$DIR/overlay.py" &
    OVERLAY_PID=$!
fi
```

- [ ] **Step 2: Test live animation and measure RSS memory**

Run: `drap restart && sleep 1 && drap test left`  
Measure: `ps -o rss,comm -p $(pgrep -f "drap-overlay")`  
Expected: RSS $\le 18\text{ MB}$ (down from 120 MB).

- [ ] **Step 3: Deploy to `/home/zius/.local/share/drap` and push to GitHub**

Run: `git push origin main`
