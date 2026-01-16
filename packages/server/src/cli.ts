#!/usr/bin/env bun
/**
 * PokéRalph CLI
 *
 * Entry point for starting PokéRalph server from the command line.
 *
 * Usage:
 *   pokeralph start [path]  - Start server with working directory at [path] (default: cwd)
 *   pokeralph --help        - Show help
 *   pokeralph --version     - Show version
 */

import { resolve } from "node:path";
import { VERSION } from "@pokeralph/core";
import { startServer } from "./index.ts";

const HELP = `
PokéRalph v${VERSION} - Autonomous Development Orchestrator

Usage:
  pokeralph start [path]    Start the server
                            [path] is the repository to work with (default: current directory)

  pokeralph --help, -h      Show this help message
  pokeralph --version, -v   Show version

Examples:
  pokeralph start                    # Start in current directory
  pokeralph start /path/to/my-repo   # Start in specific repository
  pokeralph start .                  # Explicitly use current directory

Environment Variables:
  PORT    Server port (default: 3456)

After starting, open http://localhost:3456 in your browser.
`;

function showHelp(): void {
  console.log(HELP);
  process.exit(0);
}

function showVersion(): void {
  console.log(`PokéRalph v${VERSION}`);
  process.exit(0);
}

async function validatePath(path: string): Promise<string> {
  const absolutePath = resolve(path);

  // Check if path exists and is a directory
  const proc = Bun.spawnSync(["test", "-d", absolutePath]);
  if (proc.exitCode !== 0) {
    console.error(`Error: Path does not exist or is not a directory: ${absolutePath}`);
    process.exit(1);
  }

  return absolutePath;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // No args - show help
  if (args.length === 0) {
    showHelp();
    return;
  }

  const command = args[0];

  // Handle flags
  if (command === "--help" || command === "-h") {
    showHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    showVersion();
    return;
  }

  // Handle commands
  if (command === "start") {
    const pathArg = args[1] ?? process.cwd();
    const workingDir = await validatePath(pathArg);

    console.log(`
  ____       _        ____        _       _
 |  _ \\ ___ | | _____| __ )  __ _| |_ ___| |__
 | |_) / _ \\| |/ / _ \\  _ \\ / _\` | __/ __| '_ \\
 |  __/ (_) |   <  __/ |_) | (_| | || (__| | | |
 |_|   \\___/|_|\\_\\___|____/ \\__,_|\\__\\___|_| |_|

    `);

    startServer({
      workingDir,
      port: Number(process.env.PORT) || 3456,
    });

    return;
  }

  // Unknown command
  console.error(`Unknown command: ${command}`);
  console.error('Run "pokeralph --help" for usage information.');
  process.exit(1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
