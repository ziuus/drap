#!/usr/bin/env node

const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const PROJECT_DIR = path.resolve(__dirname, "..");
const RUN_SCRIPT = path.join(PROJECT_DIR, "run.sh");
const HUB_SCRIPT = path.join(PROJECT_DIR, "hub.py");
const SHARE_SCRIPT = path.join(PROJECT_DIR, "share.sh");

const args = process.argv.slice(2);
const command = args[0] || "start";

switch (command) {
  case "start":
    console.log("🌌 Starting Drooop for Linux (Hyprland)...");
    const runner = spawn(RUN_SCRIPT, [], { stdio: "inherit" });
    runner.on("exit", (code) => process.exit(code || 0));
    break;

  case "hub":
  case "gui":
    console.log("🚀 Launching Drooop Desktop Hub...");
    spawn("python3", [HUB_SCRIPT], { stdio: "inherit", detached: true });
    break;

  case "share":
    const filePath = args[1];
    if (!filePath) {
      console.error("Usage: drooop share <filepath>");
      process.exit(1);
    }
    const sharer = spawn(SHARE_SCRIPT, [filePath], { stdio: "inherit" });
    sharer.on("exit", (code) => process.exit(code || 0));
    break;

  case "status":
    try {
      const output = execSync("curl -s http://127.0.0.1:8080/api/status").toString();
      console.log("Drooop Daemon Status:\n", JSON.parse(output));
    } catch (e) {
      console.log("❌ Drooop daemon is not running. Run 'drooop start' or 'systemctl --user start drooop'.");
    }
    break;

  case "stop":
    console.log("Shutting down Drooop processes...");
    try {
      execSync("pkill -f 'server.py' || true");
      execSync("pkill -f 'overlay.py' || true");
      console.log("✓ Drooop stopped.");
    } catch (e) {
      console.log("Nothing to stop.");
    }
    break;

  case "help":
  case "--help":
  default:
    console.log(`
🌌 Drooop for Linux (Hyprland / Wayland)
Usage:
  drooop start          Start server & GTK4 Layer Shell overlay
  drooop gui            Open special desktop control hub
  drooop share <file>   Push file from laptop to connected phone
  drooop status         Check active connections and daemon health
  drooop stop           Stop running background daemons
`);
    break;
}
