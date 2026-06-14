import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ComponentIdentityConfig } from "./types.js";

export const defaultConfig: ComponentIdentityConfig = {
  attribute: "data-component",
  include: [
    "src/**/*.{ts,tsx,js,jsx}",
    "app/**/*.{ts,tsx,js,jsx}",
    "components/**/*.{ts,tsx,js,jsx}",
  ],
  exclude: [
    "**/components/ui/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/*.stories.*",
    "**/*.d.ts",
    "**/node_modules/**",
    "**/dist/**",
  ],
};

export function loadConfig(cwd: string, configPath?: string): ComponentIdentityConfig {
  const resolvedPath = configPath
    ? path.resolve(cwd, configPath)
    : path.join(cwd, "component-identity.config.json");

  if (!existsSync(resolvedPath)) {
    return defaultConfig;
  }

  const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as Partial<ComponentIdentityConfig>;

  return {
    attribute: parsed.attribute ?? defaultConfig.attribute,
    include: parsed.include ?? defaultConfig.include,
    exclude: parsed.exclude ?? defaultConfig.exclude,
  };
}
