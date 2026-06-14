import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const DEFAULT_IGNORED_DIRS = new Set([".git", "node_modules", "dist"]);

export function findCandidateFiles(cwd: string, include: string[], exclude: string[]): string[] {
  const roots = rootsFromIncludePatterns(include);
  const files = new Set<string>();

  for (const root of roots) {
    const absoluteRoot = path.join(cwd, root);
    collectFiles(cwd, absoluteRoot, files);
  }

  return [...files]
    .filter((file) => isSupportedSourceFile(file))
    .filter((file) => matchesAnyInclude(file, include))
    .filter((file) => !matchesAnyExclude(file, exclude))
    .sort();
}

function collectFiles(cwd: string, absolutePath: string, files: Set<string>): void {
  let stat;
  try {
    stat = statSync(absolutePath);
  } catch {
    return;
  }

  if (stat.isFile()) {
    files.add(toPosix(path.relative(cwd, absolutePath)));
    return;
  }

  if (!stat.isDirectory()) {
    return;
  }

  const basename = path.basename(absolutePath);
  if (DEFAULT_IGNORED_DIRS.has(basename)) {
    return;
  }

  for (const entry of readdirSync(absolutePath)) {
    collectFiles(cwd, path.join(absolutePath, entry), files);
  }
}

function rootsFromIncludePatterns(include: string[]): string[] {
  const roots = include.map((pattern) => {
    const wildcardIndex = pattern.search(/[*{]/);
    const prefix = wildcardIndex === -1 ? pattern : pattern.slice(0, wildcardIndex);
    const root = prefix.split("/").filter(Boolean)[0];
    return root ?? ".";
  });

  return [...new Set(roots)];
}

function matchesAnyInclude(file: string, include: string[]): boolean {
  return include.some((pattern) => matchesPattern(file, pattern));
}

function matchesAnyExclude(file: string, exclude: string[]): boolean {
  return exclude.some((pattern) => matchesPattern(file, pattern));
}

function matchesPattern(file: string, pattern: string): boolean {
  const normalizedPattern = toPosix(pattern);

  if (normalizedPattern.includes("{ts,tsx,js,jsx}")) {
    const base = normalizedPattern.replace(".{ts,tsx,js,jsx}", "");
    return matchesPattern(file, `${base}.ts`) || matchesPattern(file, `${base}.tsx`) || matchesPattern(file, `${base}.js`) || matchesPattern(file, `${base}.jsx`);
  }

  return globToRegExp(normalizedPattern).test(file);
}

function isSupportedSourceFile(file: string): boolean {
  return /\.(tsx?|jsx?)$/.test(file) && !file.endsWith(".d.ts");
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    const next = pattern[index + 1];
    const afterNext = pattern[index + 2];

    if (character === "*" && next === "*" && afterNext === "/") {
      source += "(?:.*/)?";
      index += 2;
      continue;
    }

    if (character === "*" && next === "*") {
      source += ".*";
      index += 1;
      continue;
    }

    if (character === "*") {
      source += "[^/]*";
      continue;
    }

    source += escapeRegExp(character);
  }

  source += "$";
  return new RegExp(source);
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}
