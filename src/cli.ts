#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import path from "node:path";
import { defaultConfig } from "./config.js";
import { audit } from "./audit.js";

type ParsedArgs = {
  command: string;
  json: boolean;
  configPath?: string;
  cwd?: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "help" || args.command === "--help" || args.command === "-h") {
    printHelp();
    return;
  }

  if (args.command === "init") {
    const cwd = path.resolve(args.cwd ?? process.cwd());
    const configPath = path.join(cwd, "component-identity.config.json");
    writeFileSync(`${configPath}`, `${JSON.stringify(defaultConfig, null, 2)}\n`, { flag: "wx" });
    console.log(`Created ${path.relative(process.cwd(), configPath)}`);
    return;
  }

  if (args.command !== "audit" && args.command !== "report") {
    console.error(`Unknown command: ${args.command}`);
    printHelp();
    process.exitCode = 2;
    return;
  }

  const auditOptions: { cwd?: string; configPath?: string } = {};
  if (args.cwd) {
    auditOptions.cwd = args.cwd;
  }
  if (args.configPath) {
    auditOptions.configPath = args.configPath;
  }

  const result = audit(auditOptions);

  if (args.json || args.command === "report") {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(`component-identity: checked ${result.componentsChecked} component(s) in ${result.filesChecked} file(s), no violations found.`);
  } else {
    for (const violation of result.violations) {
      console.error(`${violation.file}:${violation.line}:${violation.column} ${violation.message}`);
    }
    console.error(`component-identity: found ${result.violations.length} violation(s).`);
  }

  process.exitCode = args.command === "report" || result.ok ? 0 : 1;
}

function parseArgs(rawArgs: string[]): ParsedArgs {
  const [command = "audit", ...rest] = rawArgs;
  const parsed: ParsedArgs = {
    command,
    json: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    if (arg === "--config") {
      const value = rest[index + 1];
      if (value) {
        parsed.configPath = value;
      }
      index += 1;
      continue;
    }

    if (arg === "--cwd") {
      const value = rest[index + 1];
      if (value) {
        parsed.cwd = value;
      }
      index += 1;
      continue;
    }
  }

  return parsed;
}

function printHelp(): void {
  console.log(`component-identity

Usage:
  component-identity audit [--json] [--config path] [--cwd path]
  component-identity report [--config path] [--cwd path]
  component-identity init [--cwd path]

Commands:
  audit   Check exported React components and exit non-zero on violations.
  report  Print the same audit result as JSON.
  init    Create component-identity.config.json in the target directory.
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
