import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { audit, componentNameToKebabCase } from "../dist/index.js";

test("componentNameToKebabCase maps component names canonically", () => {
  assert.equal(componentNameToKebabCase("UserMenu"), "user-menu");
  assert.equal(componentNameToKebabCase("XMLHttpButton"), "xml-http-button");
});

test("audit passes valid exported components and ignores private/custom-root components", () => {
  const result = audit({ cwd: "test/fixtures/pass" });

  assert.equal(result.ok, true);
  assert.equal(result.componentsChecked, 3);
  assert.deepEqual(result.violations, []);
});

test("audit flags missing and mismatched root data-component attributes", () => {
  const result = audit({ cwd: "test/fixtures/fail" });

  assert.equal(result.ok, false);
  assert.equal(result.componentsChecked, 2);
  assert.equal(result.violations.length, 2);
  assert.equal(result.violations[0].code, "missing-attribute");
  assert.equal(result.violations[0].expectedValue, "user-menu");
  assert.equal(result.violations[1].code, "mismatched-attribute");
  assert.equal(result.violations[1].actualValue, "account");
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
