export type ComponentIdentityConfig = {
  preset?: "next" | undefined;
  attribute: string;
  include: string[];
  exclude: string[];
  excludeFiles: string[];
  excludeComponents: string[];
  passThroughComponents: string[];
};

export type AuditOptions = {
  cwd?: string | undefined;
  configPath?: string | undefined;
  json?: boolean;
  fix?: boolean;
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
  fixable: boolean;
  message: string;
};

export type SkippedComponent = {
  file: string;
  componentName: string;
  reason: "excluded-component" | "custom-root" | "fragment-root" | "non-jsx-root";
  message: string;
};

export type AuditResult = {
  ok: boolean;
  filesChecked: number;
  componentsFound: number;
  componentsChecked: number;
  components: string[];
  auditedComponents: string[];
  skippedComponents: SkippedComponent[];
  fixesApplied: number;
  violations: Violation[];
};
