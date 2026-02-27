#!/usr/bin/env node

import { cmdInit, cmdInstall, cmdUninstall, cmdList, cmdHelp } from "./commands.js";
import { cmdServe } from "./serve.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  switch (subcommand) {
    case "init":
      cmdInit();
      break;
    case "install":
      cmdInstall();
      break;
    case "uninstall":
      cmdUninstall();
      break;
    case "list":
      cmdList();
      break;
    case "help":
      cmdHelp();
      break;
    case "serve": {
      const repoArg = args[1];
      if (!repoArg) {
        console.error("Usage: stewardmcp serve <repoPath>");
        process.exit(1);
      }
      await cmdServe(repoArg);
      break;
    }
    default:
      cmdHelp();
      break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
