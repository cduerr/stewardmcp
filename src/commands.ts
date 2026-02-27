import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { STEWARD_DIR, NAME_PREFIX, loadConfig } from "./types.js";

/** Resolve the path to the bundled defaults/ directory relative to this script. */
function getDefaultsDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return path.join(path.dirname(thisFile), "..", "defaults");
}

/** `stewardmcp init` — scaffold a .stewardmcp/ directory in the current working directory. */
export function cmdInit(): void {
  const cwd = process.cwd();
  const stewardDir = path.join(cwd, STEWARD_DIR);

  if (fs.existsSync(stewardDir)) {
    console.error(`${STEWARD_DIR}/ directory already exists. Aborting.`);
    process.exit(1);
  }

  const defaultsDir = getDefaultsDir();
  fs.mkdirSync(stewardDir, { recursive: true });

  // Copy defaults and inject derived name into config
  const defaultConfig = JSON.parse(
    fs.readFileSync(path.join(defaultsDir, "config.json"), "utf-8"),
  );
  const name = NAME_PREFIX + path.basename(cwd);
  const config = { name, ...defaultConfig };
  fs.writeFileSync(
    path.join(stewardDir, "config.json"),
    JSON.stringify(config, null, 2) + "\n",
  );

  fs.copyFileSync(
    path.join(defaultsDir, "ENGINEER.md"),
    path.join(stewardDir, "ENGINEER.md"),
  );

  // Append to ignore files if they exist and don't already include the dir
  for (const ignoreFile of [".gitignore", ".dockerignore"]) {
    const ignorePath = path.join(cwd, ignoreFile);
    if (fs.existsSync(ignorePath)) {
      const content = fs.readFileSync(ignorePath, "utf-8");
      if (!content.includes(`${STEWARD_DIR}/`)) {
        fs.appendFileSync(ignorePath, `\n${STEWARD_DIR}/\n`);
        console.log(`Added ${STEWARD_DIR}/ to ${ignoreFile}`);
      }
    }
  }

  console.log(`Created ${STEWARD_DIR}/ with default config and ENGINEER.md`);
  console.log(`Instance name: ${name}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  1. Edit ${STEWARD_DIR}/config.json and ${STEWARD_DIR}/ENGINEER.md as needed`);
  console.log("  2. Run 'npx stewardmcp@latest install' to register with Claude Code");
}

/** `stewardmcp install` — register this repo's steward as an MCP server in Claude Code. */
export function cmdInstall(): void {
  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const name = config.name;

  // Check for collision
  try {
    const existing = execSync("claude mcp list", { encoding: "utf-8" });
    if (existing.includes(name)) {
      console.error(
        `MCP server "${name}" is already registered. Run 'npx stewardmcp@latest uninstall' first to re-register.`,
      );
      process.exit(1);
    }
  } catch {
    // claude mcp list failed — might not be installed, continue anyway
  }

  try {
    execSync(
      `claude mcp add --scope user "${name}" -- npx stewardmcp@latest serve "${cwd}"`,
      { stdio: "inherit" },
    );
    console.log(`Registered MCP server: ${name}`);
  } catch {
    console.error("Failed to register MCP server. Is Claude Code installed?");
    process.exit(1);
  }
}

/** `stewardmcp uninstall` — remove this repo's steward MCP registration from Claude Code. */
export function cmdUninstall(): void {
  const cwd = process.cwd();
  const stewardDir = path.join(cwd, STEWARD_DIR);
  const configPath = path.join(stewardDir, "config.json");

  if (!fs.existsSync(configPath)) {
    console.error(`No ${STEWARD_DIR}/config.json found in ${cwd}. Nothing to uninstall.`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as { name: string };
  try {
    execSync(`claude mcp remove "${config.name}"`, { stdio: "inherit" });
    console.log(`Removed MCP server: ${config.name}`);
  } catch {
    console.log(`MCP server "${config.name}" was not registered (skipped).`);
  }

  console.log(`${STEWARD_DIR}/ was kept. Delete it manually if no longer needed.`);
}

/** `stewardmcp list` — show all steward MCP instances registered in Claude Code. */
export function cmdList(): void {
  let output: string;
  try {
    output = execSync("claude mcp list", { encoding: "utf-8" });
  } catch {
    console.error("Failed to run 'claude mcp list'. Is Claude Code installed?");
    process.exit(1);
  }

  const lines = output.split("\n").filter((line) => line.includes(NAME_PREFIX));
  if (lines.length === 0) {
    console.log("No steward instances registered.");
  } else {
    console.log(lines.join("\n"));
  }
}

/** `stewardmcp help` — print usage info for all user-facing commands. */
export function cmdHelp(): void {
  console.log("Usage: npx stewardmcp@latest <command>");
  console.log("");
  console.log("Commands:");
  console.log("  init        Scaffold .stewardmcp/ in the current directory");
  console.log("  install     Register this steward with Claude Code");
  console.log("  uninstall   Remove this steward from Claude Code");
  console.log("  list        Show all registered steward instances");
  console.log("  help        Show this help message");
}
