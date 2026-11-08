# tests/test_benchmark_surge.py
import cairo, time, sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
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
    return ms_per_frame

if __name__ == "__main__":
    ms = run_benchmark()
    if ms > 60.0:
        print(f"FAILED: {ms:.2f} ms/frame is too slow (> 60.0 ms)")
        exit(1)
    else:
        print(f"PASSED: {ms:.2f} ms/frame is verified for CPU LUT software rendering (< 60.0 ms)!")
