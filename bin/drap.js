#!/usr/bin/env node

const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const PROJECT_DIR = path.resolve(__dirname, "..");
const RUN_SCRIPT = path.join(PROJECT_DIR, "run.sh");
const HUB_SCRIPT = path.join(PROJECT_DIR, "hub.py");
const SHARE_SCRIPT = path.join(PROJECT_DIR, "share.sh");
const SYSTEMD_SERVICE = "drap.service";

const args = process.argv.slice(2);
const command = (args[0] || "help").toLowerCase();
const subCommand = (args[1] || "").toLowerCase();

function isSystemdActive() {
  try {
    const res = execSync(`systemctl --user is-active ${SYSTEMD_SERVICE} 2>/dev/null`).toString().trim();
    return res === "active";
  } catch (e) {
    return false;
  }
}

function isSystemdEnabled() {
  try {
    const res = execSync(`systemctl --user is-enabled ${SYSTEMD_SERVICE} 2>/dev/null`).toString().trim();
    return res === "enabled";
  } catch (e) {
    return false;
  }
}

function areProcessesRunning() {
  try {
    const s = execSync("pgrep -f 'server.py' 2>/dev/null").toString().trim();
    const o = execSync("pgrep -f 'overlay.py' 2>/dev/null").toString().trim();
    return Boolean(s && o);
  } catch (e) {
    return false;
  }
}

function startServices() {
  console.log("💧 Starting Drap spatial transfer system...");
  // Prefer systemd user service if enabled/installed
  try {
    const hasService = fs.existsSync(path.join(process.env.HOME, ".config/systemd/user", SYSTEMD_SERVICE));
    if (hasService) {
      execSync(`systemctl --user start ${SYSTEMD_SERVICE}`);
      console.log("✓ Drap started via systemd service.");
      return;
    }
  } catch (e) {}

  // Standalone fallback spawn
  const runner = spawn(RUN_SCRIPT, [], { stdio: "inherit", detached: true });
  runner.unref();
  console.log("✓ Drap background processes launched.");
}

function stopServices() {
  console.log("🛑 Stopping Drap services...");
  try {
    execSync(`systemctl --user stop ${SYSTEMD_SERVICE} 2>/dev/null || true`);
  } catch (e) {}
  try {
    execSync("pkill -f 'server.py' || true");
    execSync("pkill -f 'overlay.py' || true");
    console.log("✓ Drap stopped.");
  } catch (e) {
    console.log("Nothing to stop.");
  }
}

switch (command) {
  case "on":
  case "start":
    if (areProcessesRunning() || isSystemdActive()) {
      console.log("ℹ️  Drap is already running. Run 'drap status' or 'drap restart'.");
    } else {
      startServices();
    }
    break;

  case "install":
    console.log("💧 Running Drap System Installer...");
    const installer = spawn("bash", [path.join(PROJECT_DIR, "install.sh")], { stdio: "inherit" });
    installer.on("exit", (code) => process.exit(code || 0));
    break;

  case "off":
  case "stop":
    stopServices();
    break;

  case "restart":
    stopServices();
    setTimeout(() => {
      startServices();
    }, 600);
    break;

  case "autostart":
    if (subCommand === "on" || subCommand === "enable") {
      try {
        execSync(`systemctl --user daemon-reload && systemctl --user enable ${SYSTEMD_SERVICE}`);
        console.log("✓ Drap autostart on login ENABLED.");
      } catch (e) {
        console.error("❌ Failed to enable systemd service:", e.message);
      }
    } else if (subCommand === "off" || subCommand === "disable") {
      try {
        execSync(`systemctl --user disable ${SYSTEMD_SERVICE}`);
        console.log("✓ Drap autostart on login DISABLED.");
      } catch (e) {
        console.error("❌ Failed to disable systemd service:", e.message);
      }
    } else {
      const enabled = isSystemdEnabled();
      console.log(`Drap Autostart: ${enabled ? "✅ ENABLED (starts automatically on login)" : "⚪ DISABLED"}`);
      console.log("Usage: drap autostart on | off");
    }
    break;

  case "status":
    const active = areProcessesRunning() || isSystemdActive();
    const autostart = isSystemdEnabled();

    console.log("\n==================================================");
    console.log("  💧 DRAP SYSTEM STATUS");
    console.log("==================================================");
    console.log(`  State:        ${active ? "🟢 ON (Running)" : "🔴 OFF (Stopped)"}`);
    console.log(`  Autostart:    ${autostart ? "✅ Enabled on login" : "⚪ Disabled"}`);

    const configPath = path.join(process.env.HOME, ".config/drap/config.json");
    let isLiquidGlass = false;
    try {
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        isLiquidGlass = Boolean(cfg.liquid_glass);
      }
    } catch (e) {}
    console.log(`  Liquid Glass: ${isLiquidGlass ? "🌊 ENABLED (Real water optical caustics)" : "⚪ DISABLED (Default lightweight)"}`);

    if (active) {
      try {
        const raw = execSync("curl -s --max-time 1.5 http://127.0.0.1:8080/api/status").toString();
        const info = JSON.parse(raw);
        const hostIp = info.host_ip || info.ip || "127.0.0.1";
        console.log(`  IP / Gateway: http://${hostIp}:${info.port || 8080}`);
        console.log(`  HTTPS Secure: https://${hostIp}:8443 (For 1-tap PWA install)`);
        console.log(`  Phones Linked:${info.active_ws_connections} active`);
        console.log(`  LocalSend:    Port 53317 (v2 protocol active)`);
      } catch (e) {
        console.log("  Gateway:      Waiting for API response...");
      }
    } else {
      console.log("\n  To start Drap, run: 'drap on'");
    }
    console.log("==================================================\n");
    break;

  case "qr":
    try {
      let hostIp = "127.0.0.1";
      try {
        const raw = execSync("curl -s --max-time 1.2 http://127.0.0.1:8080/api/status").toString();
        const info = JSON.parse(raw);
        hostIp = info.host_ip || info.ip || "127.0.0.1";
      } catch (e) {
        try {
          const ifaces = execSync("hostname -I 2>/dev/null").toString().trim().split(" ");
          if (ifaces[0]) hostIp = ifaces[0];
        } catch (e2) {}
      }

      const gatewayUrl = `http://${hostIp}:8080`;
      const pwaUrl = `https://${hostIp}:8443`;

      console.log("\n==================================================");
      console.log("  💧 DRAP MOBILE PAIRING QR CODE");
      console.log("==================================================");
      console.log("  Scan with your phone's camera to connect:\n");

      try {
        const qrOut = execSync(`qrencode -t ANSIUTF8 "${gatewayUrl}" 2>/dev/null`).toString();
        console.log(qrOut);
      } catch (e) {
        console.log("  [ Install 'qrencode' to view ASCII QR in terminal ]\n");
      }

      console.log("--------------------------------------------------");
      console.log(`  📱 Mobile Web App:  ${gatewayUrl}`);
      console.log(`  🔒 Secure PWA:      ${pwaUrl}`);
      console.log("==================================================\n");
    } catch (e) {
      console.error("❌ Failed to generate QR code:", e.message);
    }
    break;

  case "update":
    console.log("\n==================================================");
    console.log("  💧 UPDATING DRAP TO LATEST VERSION");
    console.log("==================================================");
    try {
      console.log("==> Fetching latest release from GitHub...");
      const pullOut = execSync(`git -C "${PROJECT_DIR}" pull --ff-only 2>&1`).toString();
      console.log(pullOut.trim());

      const commit = execSync(`git -C "${PROJECT_DIR}" rev-parse --short HEAD`).toString().trim();
      const commitMsg = execSync(`git -C "${PROJECT_DIR}" log -1 --pretty=%B`).toString().trim().split("\n")[0];
      console.log(`==> Current commit: ${commit} ("${commitMsg}")`);

      console.log("==> Updating system files and daemons...");
      execSync(`bash "${path.join(PROJECT_DIR, "install.sh")}"`, { stdio: "inherit" });

      console.log("==> Restarting Drap services...");
      stopServices();
      setTimeout(() => {
        startServices();
        console.log("\n==================================================");
        console.log(`✨ Drap successfully updated to commit ${commit}!`);
        console.log("==================================================\n");
      }, 700);
    } catch (e) {
      console.error("❌ Update failed:", e.message);
    }
    break;

  case "devices":
    try {
      const raw = execSync("curl -s --max-time 1.5 http://127.0.0.1:8080/api/devices").toString();
      const data = JSON.parse(raw);
      console.log("\n==================================================");
      console.log(`  🔒 DRAP DEVICE ACCESS CONTROL (Mode: ${data.mode.toUpperCase()})`);
      console.log("==================================================");
      if (!data.devices || data.devices.length === 0) {
        console.log("  No devices recorded yet. Run 'drap qr' to pair a phone.");
      } else {
        data.devices.forEach((d) => {
          let statusIcon = "🟡 PENDING";
          if (d.always_allowed) {
            statusIcon = "🟢 ALWAYS ALLOWED";
          } else if (d.status === "allowed") {
            statusIcon = "🟢 ALLOWED";
          } else if (d.status === "blocked") {
            statusIcon = "🔴 BLOCKED";
          }
          console.log(`  • ${d.ip.padEnd(16)} | ${statusIcon.padEnd(18)} | ${d.name}`);
        });
      }
      console.log("--------------------------------------------------");
      console.log("  Manage devices:");
      console.log("    drap trust <ip>       Permanently allow device (Always Allowed)");
      console.log("    drap allow <ip>       Authorize device for session");
      console.log("    drap block <ip>       Block device from connecting");
      console.log("    drap security <mode>  Policy: open | prompt | strict");
      console.log("==================================================\n");
    } catch (e) {
      console.error("❌ Failed to query devices. Is Drap running? ('drap on')");
    }
    break;

  case "trust":
  case "always-allow":
    const trustIp = args[1];
    if (!trustIp) {
      console.error("Usage: drap trust <device-ip>");
      process.exit(1);
    }
    try {
      execSync(`curl -s -X POST http://127.0.0.1:8080/api/devices/trust -H "Content-Type: application/json" -d '{"ip":"${trustIp}"}'`);
      console.log(`✓ Device ${trustIp} is now ALWAYS ALLOWED (Permanently Trusted).`);
    } catch (e) {
      console.error("❌ Failed to trust device. Is Drap running? ('drap on')");
    }
    break;

  case "allow":
    const allowIp = args[1];
    const isAlways = args[2] === "always" || args.includes("--always");
    if (!allowIp) {
      console.error("Usage: drap allow <device-ip> [--always]");
      process.exit(1);
    }
    try {
      execSync(`curl -s -X POST http://127.0.0.1:8080/api/devices/allow -H "Content-Type: application/json" -d '{"ip":"${allowIp}", "always": ${isAlways}}'`);
      console.log(`✓ Device ${allowIp} is now ${isAlways ? "ALWAYS ALLOWED (Trusted)" : "ALLOWED"}.`);
    } catch (e) {
      console.error("❌ Failed to allow device. Is Drap running? ('drap on')");
    }
    break;

  case "block":
    const blockIp = args[1];
    if (!blockIp) {
      console.error("Usage: drap block <device-ip>");
      process.exit(1);
    }
    try {
      execSync(`curl -s -X POST http://127.0.0.1:8080/api/devices/block -H "Content-Type: application/json" -d '{"ip":"${blockIp}"}'`);
      console.log(`✓ Device ${blockIp} is now BLOCKED.`);
    } catch (e) {
      console.error("❌ Failed to block device. Is Drap running? ('drap on')");
    }
    break;

  case "security":
    const secMode = subCommand;
    if (!["open", "prompt", "strict"].includes(secMode)) {
      console.log("Usage: drap security [open | prompt | strict]");
      console.log("  open    : Anyone on Wi-Fi can transfer without friction");
      console.log("  prompt  : Desktop notifies on new device, can allow/block");
      console.log("  strict  : Whitelist only (unregistered devices blocked)");
      process.exit(1);
    }
    try {
      execSync(`curl -s -X POST http://127.0.0.1:8080/api/devices/mode -H "Content-Type: application/json" -d '{"mode":"${secMode}"}'`);
      console.log(`✓ Drap security mode set to: ${secMode.toUpperCase()}`);
    } catch (e) {
      console.error("❌ Failed to set security mode. Is Drap running? ('drap on')");
    }
    break;

  case "theme":
    const chosenTheme = subCommand;
    if (!["aurora", "plasma", "solar", "liquid"].includes(chosenTheme)) {
      console.log("Usage: drap theme [aurora | plasma | solar | liquid]");
      process.exit(1);
    }
    try {
      execSync(`curl -s -X POST http://127.0.0.1:8080/api/effect -H "Content-Type: application/json" -d '{"theme":"${chosenTheme}"}'`);
      console.log(`✓ Active theme switched to: ${chosenTheme}`);
    } catch (e) {
      console.error("❌ Failed to switch theme. Is Drap running? ('drap on')");
    }
    break;

  case "config":
    const key = (args[1] || "").toLowerCase();
    const val = (args[2] || "").toLowerCase();
    const configDir = path.join(process.env.HOME, ".config/drap");
    const cfgFile = path.join(configDir, "config.json");
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    let currentConfig = { liquid_glass: false };
    try {
      if (fs.existsSync(cfgFile)) {
        currentConfig = JSON.parse(fs.readFileSync(cfgFile, "utf-8"));
      }
    } catch (e) {}

    if (key === "liquid_glass" || key === "liquidglass" || key === "water") {
      if (val === "on" || val === "true" || val === "enable" || val === "1") {
        currentConfig.liquid_glass = true;
        fs.writeFileSync(cfgFile, JSON.stringify(currentConfig, null, 2));
        try {
          execSync("curl -s -X POST http://127.0.0.1:8080/api/config -H 'Content-Type: application/json' -d '{\"liquid_glass\":true}' 2>/dev/null");
        } catch (e) {}
        try {
          execSync("pkill -SIGUSR1 -f 'python3.*overlay.py' 2>/dev/null");
        } catch (e) {}
        console.log("💧 Liquid Glass Water FX: ENABLED (Ultra-realistic optical water caustics)");
      } else if (val === "off" || val === "false" || val === "disable" || val === "0") {
        currentConfig.liquid_glass = false;
        fs.writeFileSync(cfgFile, JSON.stringify(currentConfig, null, 2));
        try {
          execSync("curl -s -X POST http://127.0.0.1:8080/api/config -H 'Content-Type: application/json' -d '{\"liquid_glass\":false}' 2>/dev/null");
        } catch (e) {}
        try {
          execSync("pkill -SIGUSR1 -f 'python3.*overlay.py' 2>/dev/null");
        } catch (e) {}
        console.log("💧 Liquid Glass Water FX: DISABLED (Clean lightweight baseline)");
      } else {
        console.log(`Liquid Glass Water FX is currently: ${currentConfig.liquid_glass ? "ENABLED" : "DISABLED"}`);
        console.log("Usage: drap config liquid_glass on | off");
      }
    } else {
      console.log("\n==================================================");
      console.log("  💧 DRAP CONFIGURATION");
      console.log("==================================================");
      console.log(`  Liquid Glass Water FX: ${currentConfig.liquid_glass ? "ENABLED" : "DISABLED"}`);
      console.log("\nUsage:");
      console.log("  drap config liquid_glass on     # Enable ultra-realistic water ripples");
      console.log("  drap config liquid_glass off    # Disable (Default lightweight)");
      console.log("==================================================\n");
    }
    break;

  case "hub":
  case "gui":
    console.log("🚀 Launching Drap Desktop Hub...");
    spawn("python3", [HUB_SCRIPT], { stdio: "inherit", detached: true });
    break;

  case "share":
    const filePath = args[1];
    if (!filePath) {
      console.error("Usage: drap share <filepath>");
      process.exit(1);
    }
    const sharer = spawn(SHARE_SCRIPT, [filePath], { stdio: "inherit" });
    sharer.on("exit", (code) => process.exit(code || 0));
    break;

  case "help":
  case "--help":
  case "-h":
  default:
    console.log(`
💧 Drap - Spatial Cross-Device Transfer & Continuity System

Pairing & Mobile Access:
  drap qr                 Display pairing QR code in terminal for mobile pairing
  drap gui                Open native GTK4 Control Panel & high-res pairing QR code
  drap status             Display system health, active phones, and network IPs
  drap share <file>       Push any file from your laptop terminal to your phone

Lifecycle:
  drap install            Install Drap command, desktop entry & systemd service
  drap on                 Turn Drap ON (starts background server & bezel overlay)
  drap off                Turn Drap OFF (stops all processes)
  drap restart            Restart all Drap services
  drap update             Pull latest updates from GitHub and refresh system installation
  drap autostart on       Enable automatic launch when logging into Linux
  drap autostart off      Disable automatic launch on login

Security & Access Control:
  drap devices            List connected, allowed, trusted, and blocked devices
  drap trust <ip>         Permanently allow a device (Always Allowed without prompt)
  drap allow <ip>         Authorize a phone / device IP for this session
  drap block <ip>         Block an untrusted device from connecting
  drap security <mode>    Set policy: open | prompt (default) | strict

Visuals & Themes:
  drap config liquid_glass on|off   Enable or disable ultra-realistic water ripple FX (default: off)
  drap theme <name>                 Switch active shader palette (aurora, plasma, solar, liquid)
`);
    break;
}
