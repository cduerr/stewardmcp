import * as fs from "node:fs";
import * as path from "node:path";

export interface StewardConfig {
  name: string;
  idle_timeout_minutes: number;
  allowed_tools: string[];
  warmup_prompt: string;
}

export const STEWARD_DIR = ".stewardmcp";
export const NAME_PREFIX = "stewardmcp-";

export function loadConfig(repoPath: string): StewardConfig {
  const configPath = path.join(repoPath, STEWARD_DIR, "config.json");
  if (!fs.existsSync(configPath)) {
    console.error(
      `No ${STEWARD_DIR}/config.json found in ${repoPath}. Run 'npx stewardmcp@latest init' in the target repo first.`,
    );
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, "utf-8")) as StewardConfig;
}
