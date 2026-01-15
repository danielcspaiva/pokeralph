#!/usr/bin/env bun
/**
 * Development script that runs server and web concurrently.
 *
 * - Server: Hono API on port 3456 with watch mode
 * - Web: Vite dev server on port 5173 with HMR
 *
 * Both processes are killed on Ctrl+C.
 */

import type { Subprocess } from "bun";

// ANSI color codes for process identification
const colors = {
	server: "\x1b[36m", // Cyan
	web: "\x1b[35m", // Magenta
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	bold: "\x1b[1m",
};

interface ProcessConfig {
	name: string;
	cwd: string;
	command: string[];
	color: string;
}

const processes: ProcessConfig[] = [
	{
		name: "server",
		cwd: "packages/server",
		command: ["bun", "--watch", "run", "src/index.ts"],
		color: colors.server,
	},
	{
		name: "web",
		cwd: "packages/web",
		command: ["bunx", "vite", "--clearScreen", "false"],
		color: colors.web,
	},
];

const runningProcesses: Map<string, Subprocess> = new Map();
let isShuttingDown = false;

function formatPrefix(name: string, color: string): string {
	const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
	return `${colors.dim}${timestamp}${colors.reset} ${color}[${name}]${colors.reset}`;
}

async function streamOutput(
	stream: ReadableStream<Uint8Array> | null,
	name: string,
	color: string,
): Promise<void> {
	if (!stream) return;

	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const prefix = formatPrefix(name, color);

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const text = decoder.decode(value, { stream: true });
			const lines = text.split("\n");

			for (const line of lines) {
				if (line.trim()) {
					console.log(`${prefix} ${line}`);
				}
			}
		}
	} catch {
		// Stream closed, ignore
	}
}

async function spawnProcess(config: ProcessConfig): Promise<Subprocess> {
	const proc = Bun.spawn(config.command, {
		cwd: config.cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			FORCE_COLOR: "1", // Enable colors in child processes
		},
	});

	// Stream stdout and stderr with colored prefixes
	streamOutput(proc.stdout, config.name, config.color);
	streamOutput(proc.stderr, config.name, config.color);

	return proc;
}

async function startAll(): Promise<void> {
	console.log(
		`\n${colors.bold}🚀 Starting PokéRalph development servers...${colors.reset}\n`,
	);
	console.log(
		`${colors.server}[server]${colors.reset} Hono API → http://localhost:3456`,
	);
	console.log(
		`${colors.web}[web]${colors.reset}    Vite   → http://localhost:5173`,
	);
	console.log(`\n${colors.dim}Press Ctrl+C to stop all processes${colors.reset}\n`);

	for (const config of processes) {
		const proc = await spawnProcess(config);
		runningProcesses.set(config.name, proc);
	}
}

async function shutdown(): Promise<void> {
	if (isShuttingDown) return;
	isShuttingDown = true;

	console.log(
		`\n${colors.dim}Shutting down all processes...${colors.reset}`,
	);

	for (const [name, proc] of runningProcesses) {
		try {
			proc.kill();
			console.log(`${colors.dim}Stopped ${name}${colors.reset}`);
		} catch {
			// Process already dead
		}
	}

	runningProcesses.clear();
	process.exit(0);
}

// Handle Ctrl+C
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Monitor processes and handle exits
async function monitorProcesses(): Promise<void> {
	while (!isShuttingDown) {
		for (const [name, proc] of runningProcesses) {
			// Check if process has exited
			if (proc.exitCode !== null) {
				console.log(
					`\n${colors.bold}Process ${name} exited with code ${proc.exitCode}${colors.reset}`,
				);

				// If a process crashes, shut down everything
				if (proc.exitCode !== 0 && !isShuttingDown) {
					console.log(
						`${colors.dim}Shutting down due to ${name} failure...${colors.reset}`,
					);
					await shutdown();
					return;
				}
			}
		}
		// Check every second
		await Bun.sleep(1000);
	}
}

// Main entry point
await startAll();
await monitorProcesses();
