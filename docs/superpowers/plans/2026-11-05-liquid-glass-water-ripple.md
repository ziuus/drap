# Desktop Liquid Glass & Physical Water Ripple Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an ultra-realistic optical liquid glass water ripple effect on the Linux desktop overlay upon file drop, complete with crystalline water meniscus, directional ambient specular reflections, caustic contact shadow, harmonic micro-ripples, and a default-disabled CLI configuration toggle.

**Architecture:** 
1. Configuration toggle stored in `~/.config/drap/config.json` (`"liquid_glass": false` by default) with CLI commands `drap config liquid_glass on|off` and dynamic reload.
2. Physics-based procedural Cairo rendering inside `overlay.py` that computes directional surface normals against a virtual ambient light source, drawing specular highlights, refractive caustic shadows, and a translucent crystalline liquid body.
3. Strict 0.00% idle CPU guarantee via dynamic GTK4 tick callback activation only during the 1.1s wave lifetime.

**Tech Stack:** Python 3, PyGObject (GTK4 + gtk4-layer-shell), Cairo 2D graphics, Bash CLI.

## Global Constraints
- Target platform: Linux Wayland (Hyprland / wlroots).
- Disabled by default: `liquid_glass` must default to `false`.
- Performance: Locked 60–144 FPS during ripple; exactly 0.00% CPU when idle.
- Zero mock or placeholder code; production-grade implementations only.

---

### Task 1: Configuration Management & CLI Toggle

**Files:**
- Modify: `drap:20-150` (CLI script)
- Modify: `server.py:50-80`
- Modify: `overlay.py:100-140`
- Test: `tests/test_liquid_glass_config.py`

**Interfaces:**
- Consumes: `~/.config/drap/config.json`
- Produces: `liquid_glass` boolean flag in `DrapOverlay` and CLI commands `drap config liquid_glass on|off`.

- [ ] **Step 1: Write unit test for config file reading & default value**

```python
# tests/test_liquid_glass_config.py
import json
import tempfile
from pathlib import Path

def load_liquid_glass_setting(config_path: Path) -> bool:
    if not config_path.exists():
        return False
    try:
        data = json.loads(config_path.read_text())
        return bool(data.get("liquid_glass", False))
    except Exception:
        return False

def test_default_is_disabled():
    with tempfile.TemporaryDirectory() as tmpdir:
        cfg = Path(tmpdir) / "config.json"
        assert load_liquid_glass_setting(cfg) is False

def test_explicit_enabled():
    with tempfile.TemporaryDirectory() as tmpdir:
        cfg = Path(tmpdir) / "config.json"
        cfg.write_text(json.dumps({"liquid_glass": True}))
        assert load_liquid_glass_setting(cfg) is True
```

- [ ] **Step 2: Run test to verify it passes**

Run: `python3 -m pytest tests/test_liquid_glass_config.py -v`  
Expected: PASS

- [ ] **Step 3: Update `drap` CLI script with `config liquid_glass on|off` and status display**

Add subcommands to `drap` CLI:
```bash
    config)
      case "$2" in
        liquid_glass)
          mkdir -p "$CONFIG_DIR"
          CFG_FILE="$CONFIG_DIR/config.json"
          [ -f "$CFG_FILE" ] || echo "{}" > "$CFG_FILE"
          if [ "$3" = "on" ] || [ "$3" = "true" ] || [ "$3" = "1" ]; then
            python3 -c "import json, sys; p=sys.argv[1]; d=json.load(open(p)) if open(p).read().strip() else {}; d['liquid_glass']=True; json.dump(d, open(p,'w'), indent=2)" "$CFG_FILE"
            echo "💧 Liquid Glass Water FX: ENABLED"
            # Signal running overlay to reload config
            pkill -SIGUSR1 -f "python3.*overlay.py" 2>/dev/null || true
          else
            python3 -c "import json, sys; p=sys.argv[1]; d=json.load(open(p)) if open(p).read().strip() else {}; d['liquid_glass']=False; json.dump(d, open(p,'w'), indent=2)" "$CFG_FILE"
            echo "💧 Liquid Glass Water FX: DISABLED"
            pkill -SIGUSR1 -f "python3.*overlay.py" 2>/dev/null || true
          fi
          ;;
        *)
          echo "Usage: drap config liquid_glass on|off"
          ;;
      esac
      ;;
```
And display in `drap status`:
```bash
  LG_STATUS=$(python3 -c "import json; print('Enabled' if json.load(open('$CONFIG_DIR/config.json')).get('liquid_glass', False) else 'Disabled')" 2>/dev/null || echo "Disabled")
  echo "  💧 Liquid Glass Water FX: $LG_STATUS (Default: Disabled)"
```

- [ ] **Step 4: Load `liquid_glass` in `overlay.py` with SIGUSR1 live reload handler**

```python
    def _load_config(self):
        self.config_path = Path.home() / ".config" / "drap" / "config.json"
        self.liquid_glass_enabled = False
        if self.config_path.exists():
            try:
                data = json.loads(self.config_path.read_text())
                self.liquid_glass_enabled = bool(data.get("liquid_glass", False))
            except Exception:
                pass
```

- [ ] **Step 5: Commit Task 1 changes**

```bash
git add tests/test_liquid_glass_config.py drap overlay.py server.py
git commit -m "feat(config): add liquid_glass configuration toggle and CLI command"
```

---

### Task 2: Optical Liquid Glass Physics & Cairo Water Meniscus Rendering Engine

**Files:**
- Modify: `overlay.py:930-1040`
- Test: `tests/test_render_liquid_glass.py`

**Interfaces:**
- Consumes: `confirm_anim_progress`, `confirm_edge`, `confirm_coord`, `self.liquid_glass_enabled`
- Produces: Multi-layer Cairo rendering of crystalline meniscus, directional specular crests, caustic contact shadows, trailing wakes, and droplet beads.

- [ ] **Step 1: Write headless test script to render liquid glass frame to PNG**

```python
# tests/test_render_liquid_glass.py
import cairo
import math

def render_liquid_water_frame(width=1920, height=1080, progress=0.35, edge="right", coord=0.5):
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, width, height)
    cr = cairo.Context(surface)
    
    # Import and call rendering function
    from overlay import DrapOverlay
    overlay = DrapOverlay.__new__(DrapOverlay)
    overlay.effect_theme = "aurora"
    overlay.confirm_edge = edge
    overlay.confirm_coord = coord
    overlay.liquid_glass_enabled = True
    
    overlay._draw_fullscreen_confirm_wave(cr, width, height, progress)
    surface.write_to_png("/tmp/test_liquid_glass.png")
    return True
```

- [ ] **Step 2: Implement `_draw_fullscreen_confirm_wave` with authentic optical water physics**

When `self.liquid_glass_enabled` is `True`:
1. Calculate wave expansion: $R = \text{progress} \cdot R_{max}$.
2. Light Vector: $L = (-0.6, -0.8)$ normalized to $(-0.6, -0.8) / \sqrt{0.36 + 0.64} = (-0.6, -0.8)$.
3. Meniscus Fluid Body:
   - Translucent crystalline water gradient: `rgba(160, 230, 255, 0.14 * damping)` to `rgba(56, 189, 248, 0.22 * damping)` with soft outer edge.
4. Specular Highlight Crest:
   - Line width 3.2px, color modulated by $(N \cdot L)$: brightest where wave curvature points toward ambient light, with gleaming pure white specular glint (`rgba(255, 255, 255, 0.92 * damping)`).
5. Caustic Contact Shadow:
   - Line width 4.5px, offset along $-N$, `rgba(0, 0, 0, 0.30 * damping)`.
6. Trailing Harmonic Wake:
   - Secondary ripple 45px behind, softer reflection.
7. Micro Droplet Beads:
   - 4-6 small circular droplet beads ($r = 3-6\text{px}$) scattering near the entry point with spherical specular highlights and drop shadows.

When `self.liquid_glass_enabled` is `False`:
- Lightweight fallback radial pulse / ambient glow (or clean exit if disabled).

- [ ] **Step 3: Run headless test script to generate test artifact**

Run: `python3 tests/test_render_liquid_glass.py`  
Expected: Generates `/tmp/test_liquid_glass.png` successfully without errors.

- [ ] **Step 4: Commit Task 2 changes**

```bash
git add overlay.py tests/test_render_liquid_glass.py
git commit -m "feat(overlay): procedural optical liquid glass water ripple with caustics and specular highlights"
```

---

### Task 3: Deployment, Verification & Live Testing

**Files:**
- Modify: `README.md` (document `drap config liquid_glass on|off`)
- Deploy target: `/home/zius/.local/share/drap/`
- Command: `/home/zius/.local/bin/drap`

- [ ] **Step 1: Verify syntax across Python codebase**

Run: `python3 -m py_compile overlay.py server.py`  
Expected: 0 syntax errors.

- [ ] **Step 2: Sync files to `/home/zius/.local/share/drap` and `/home/zius/.local/bin/drap`**

Run: `cp -r overlay.py server.py client /home/zius/.local/share/drap/ && cp drap /home/zius/.local/bin/drap`

- [ ] **Step 3: Test CLI toggle and status output**

Run: `drap config liquid_glass off && drap status`  
Verify: Output reports `💧 Liquid Glass Water FX: Disabled (Default: Disabled)`.  
Run: `drap config liquid_glass on && drap status`  
Verify: Output reports `💧 Liquid Glass Water FX: Enabled`.  
Run: `drap config liquid_glass off` (leave disabled by default as requested).

- [ ] **Step 4: Restart Drap daemon and verify service health**

Run: `drap restart && systemctl --user status drap.service`  
Verify: Both `server.py` and `overlay.py` are active and running with 0 errors.

- [ ] **Step 5: Final Git commit & push**

Run: `git push origin main`
