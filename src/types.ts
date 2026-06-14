export type ComponentIdentityConfig = {
  attribute: string;
  include: string[];
  exclude: string[];
};

export type AuditOptions = {
  cwd?: string | undefined;
  configPath?: string | undefined;
  json?: boolean;
};

export type ViolationCode = "missing-attribute" | "mismatched-attribute";

export type Violation = {
  code: ViolationCode;
  file: string;
  line: number;
  column: number;
  componentName: string;
  expectedValue: string;
  actualValue?: string | undefined;
  message: string;
};

export type AuditResult = {
  ok: boolean;
  filesChecked: number;
  componentsChecked: number;
  violations: Violation[];
};
