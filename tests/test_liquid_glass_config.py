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

def test_explicit_disabled():
    with tempfile.TemporaryDirectory() as tmpdir:
        cfg = Path(tmpdir) / "config.json"
        cfg.write_text(json.dumps({"liquid_glass": False}))
        assert load_liquid_glass_setting(cfg) is False

if __name__ == "__main__":
    test_default_is_disabled()
    test_explicit_enabled()
    test_explicit_disabled()
    print("All config tests passed!")
