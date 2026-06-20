import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { audit, componentNameToKebabCase, nextConfig } from "../dist/index.js";

test("componentNameToKebabCase maps component names canonically", () => {
  assert.equal(componentNameToKebabCase("UserMenu"), "user-menu");
  assert.equal(componentNameToKebabCase("XMLHttpButton"), "xml-http-button");
});

test("audit passes valid exported components and ignores private/custom-root components", () => {
  const result = audit({ cwd: "test/fixtures/pass" });

  assert.equal(result.ok, true);
  assert.equal(result.componentsChecked, 3);
  assert.equal(result.componentsFound, 4);
  assert.equal(result.skippedComponents.length, 1);
  assert.deepEqual(result.violations, []);
});

test("audit flags missing and mismatched root data-component attributes", () => {
  const result = audit({ cwd: "test/fixtures/fail" });

  assert.equal(result.ok, false);
  assert.equal(result.componentsChecked, 2);
  assert.equal(result.componentsFound, 2);
  assert.equal(result.violations.length, 2);
  assert.equal(result.violations[0].code, "missing-attribute");
  assert.equal(result.violations[0].expectedValue, "user-menu");
  assert.equal(result.violations[1].code, "mismatched-attribute");
  assert.equal(result.violations[1].actualValue, "account");
});

test("audit detects defaults, named export lists, wrappers, fragments, pass-through roots, and skip reasons", () => {
  const result = audit({ cwd: "test/fixtures/advanced" });

  assert.equal(result.ok, true);
  assert.equal(result.componentsFound, 10);
  assert.equal(result.componentsChecked, 7);
  assert.deepEqual(result.auditedComponents, [
    "src/components.tsx#DefaultFunction",
    "src/components.tsx#DefaultConst",
    "src/components.tsx#ListedExport",
    "src/components.tsx#MemoBaseExport",
    "src/components.tsx#NestedWrapper",
    "src/components.tsx#FragmentRoot",
    "src/components.tsx#SlotRoot",
  ]);
  assert.deepEqual(
    result.skippedComponents.map((component) => [component.componentName, component.reason]),
    [
      ["IgnoredByName", "excluded-component"],
      ["CustomRoot", "custom-root"],
      ["EmptyFragment", "fragment-root"],
    ],
  );
});

test("audit can autofix simple missing and mismatched attributes", () => {
  const cwd = mkdtempSync(join(tmpdir(), "component-identity-"));
  cpSync("test/fixtures/fail", cwd, { recursive: true });

  try {
    const result = audit({ cwd, fix: true });
    assert.equal(result.ok, true);
    assert.equal(result.fixesApplied, 2);

    const fixed = readFileSync(join(cwd, "src/components.tsx"), "utf8");
    assert.match(fixed, /<div data-component="user-menu" \/>/);
    assert.match(fixed, /<section data-component="account-card" \/>/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("nextConfig excludes Next.js entry files and generated UI/test/story paths", () => {
  assert.ok(nextConfig.exclude.includes("**/page.*"));
  assert.ok(nextConfig.exclude.includes("**/layout.*"));
  assert.ok(nextConfig.exclude.includes("**/components/ui/**"));
  assert.ok(nextConfig.exclude.includes("**/*.test.*"));
  assert.ok(nextConfig.exclude.includes("**/*.stories.*"));
});

test("CLI exits non-zero for violations and emits JSON reports", () => {
  const output = execFileSync("node", ["dist/cli.js", "report", "--cwd", "test/fixtures/fail"], {
    encoding: "utf8",
  });
  const result = JSON.parse(output);

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 2);

  assert.throws(() => {
    execFileSync("node", ["dist/cli.js", "audit", "--cwd", "test/fixtures/fail"], {
      encoding: "utf8",
      stdio: "pipe",
    });
  });
});
