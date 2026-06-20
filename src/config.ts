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
  excludeFiles: [],
  excludeComponents: [],
  passThroughComponents: [],
};

export const nextConfig: ComponentIdentityConfig = {
  ...defaultConfig,
  preset: "next",
  exclude: [
    ...defaultConfig.exclude,
    "**/page.*",
    "**/pages/**",
    "**/layout.*",
    "**/loading.*",
    "**/error.*",
    "**/not-found.*",
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
  const baseConfig = parsed.preset === "next" ? nextConfig : defaultConfig;

  return {
    preset: parsed.preset,
    attribute: parsed.attribute ?? baseConfig.attribute,
    include: parsed.include ?? baseConfig.include,
    exclude: [...(parsed.exclude ?? baseConfig.exclude), ...(parsed.excludeFiles ?? baseConfig.excludeFiles)],
    excludeFiles: parsed.excludeFiles ?? baseConfig.excludeFiles,
    excludeComponents: parsed.excludeComponents ?? baseConfig.excludeComponents,
    passThroughComponents: parsed.passThroughComponents ?? baseConfig.passThroughComponents,
  };
}
