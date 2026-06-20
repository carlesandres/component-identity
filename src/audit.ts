import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { loadConfig } from "./config.js";
import { findCandidateFiles } from "./glob.js";
import { componentNameToKebabCase } from "./naming.js";
import type { AuditOptions, AuditResult, ComponentIdentityConfig, SkippedComponent, Violation } from "./types.js";

type ComponentCandidate = {
  name: string;
  body: ts.Node;
};

type RootLookup =
  | { kind: "auditable"; root: ts.JsxOpeningLikeElement }
  | { kind: "skipped"; reason: SkippedComponent["reason"] };

type TextEdit = {
  start: number;
  end: number;
  text: string;
};

export function audit(options: AuditOptions = {}): AuditResult {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const config = loadConfig(cwd, options.configPath);
  const files = findCandidateFiles(cwd, config.include, config.exclude);
  const violations: Violation[] = [];
  const components: string[] = [];
  const auditedComponents: string[] = [];
  const skippedComponents: SkippedComponent[] = [];
  let componentsChecked = 0;
  let fixesApplied = 0;

  for (const file of files) {
    const absolutePath = path.join(cwd, file);
    const sourceText = readFileSync(absolutePath, "utf8");
    const sourceFile = ts.createSourceFile(
      absolutePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForFile(file),
    );
    const edits: TextEdit[] = [];

    for (const candidate of findExportedComponents(sourceFile)) {
      components.push(`${file}#${candidate.name}`);

      if (matchesNamePattern(candidate.name, config.excludeComponents)) {
        skippedComponents.push(skip(file, candidate.name, "excluded-component"));
        continue;
      }

      const root = findAuditableRoot(candidate.body, config);
      if (root.kind === "skipped") {
        skippedComponents.push(skip(file, candidate.name, root.reason));
        continue;
      }

      auditedComponents.push(`${file}#${candidate.name}`);
      componentsChecked += 1;
      const violation = auditRootElement(sourceFile, file, candidate.name, root.root, config);
      if (violation) {
        violations.push(violation);
        if (options.fix && violation.fixable) {
          const edit = fixForViolation(sourceFile, root.root, violation, config.attribute);
          if (edit) {
            edits.push(edit);
            fixesApplied += 1;
          }
        }
      }
    }

    if (edits.length > 0) {
      writeFileSync(absolutePath, applyTextEdits(sourceText, edits));
    }
  }

  if (options.fix && fixesApplied > 0) {
    const fixed = audit({ ...options, fix: false });
    return { ...fixed, fixesApplied };
  }

  return {
    ok: violations.length === 0,
    filesChecked: files.length,
    componentsFound: components.length,
    componentsChecked,
    components,
    auditedComponents,
    skippedComponents,
    fixesApplied,
    violations,
  };
}

function findExportedComponents(sourceFile: ts.SourceFile): ComponentCandidate[] {
  const candidates: ComponentCandidate[] = [];
  const declarations = new Map<string, ts.Node>();
  const variableInitializers = new Map<string, ts.Expression>();
  const seen = new Set<string>();

  const addCandidate = (name: string, body: ts.Node | undefined): void => {
    if (!body || seen.has(name)) {
      return;
    }
    seen.add(name);
    candidates.push({ name, body });
  };

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && isComponentName(statement.name.text)) {
      declarations.set(statement.name.text, statement.body ?? statement);
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && isComponentName(declaration.name.text) && declaration.initializer) {
          variableInitializers.set(declaration.name.text, declaration.initializer);
        }
      }
    }
  }

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement) && isComponentName(statement.name.text)) {
      addCandidate(statement.name.text, statement.body ?? statement);
      continue;
    }

    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !isComponentName(declaration.name.text) || !declaration.initializer) {
          continue;
        }

        addCandidate(declaration.name.text, componentBodyFromInitializer(declaration.initializer, declarations, variableInitializers));
      }
    }

    if (ts.isExportAssignment(statement)) {
      const candidate = componentFromDefaultExport(statement.expression, declarations, variableInitializers);
      if (candidate) {
        addCandidate(candidate.name, candidate.body);
      }
    }

    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const localName = element.propertyName?.text ?? element.name.text;
        const exportedName = element.name.text;
        if (!isComponentName(exportedName)) {
          continue;
        }

        addCandidate(
          exportedName,
          declarations.get(localName) ?? componentBodyFromInitializer(variableInitializers.get(localName), declarations, variableInitializers),
        );
      }
    }
  }

  return candidates;
}

function componentFromDefaultExport(
  expression: ts.Expression,
  declarations: Map<string, ts.Node>,
  variableInitializers: Map<string, ts.Expression>,
): ComponentCandidate | undefined {
  if (ts.isIdentifier(expression) && isComponentName(expression.text)) {
    return {
      name: expression.text,
      body: declarations.get(expression.text) ?? componentBodyFromInitializer(variableInitializers.get(expression.text), declarations, variableInitializers) ?? expression,
    };
  }

  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return expression.name && isComponentName(expression.name.text) ? { name: expression.name.text, body: expression.body } : undefined;
  }

  if (ts.isCallExpression(expression)) {
    return unwrapComponentCall(expression, declarations, variableInitializers);
  }

  return undefined;
}

function componentBodyFromInitializer(
  initializer: ts.Expression | undefined,
  declarations: Map<string, ts.Node> = new Map(),
  variableInitializers: Map<string, ts.Expression> = new Map(),
): ts.Node | undefined {
  if (!initializer) {
    return undefined;
  }

  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    return initializer.body;
  }

  if (ts.isCallExpression(initializer) && isWrapperCall(initializer, "forwardRef")) {
    const render = initializer.arguments[0];
    if (render && (ts.isArrowFunction(render) || ts.isFunctionExpression(render))) {
      return render.body;
    }

    if (render && ts.isCallExpression(render)) {
      return componentBodyFromInitializer(render, declarations, variableInitializers);
    }
  }

  if (ts.isCallExpression(initializer) && isWrapperCall(initializer, "memo")) {
    const wrapped = initializer.arguments[0];
    if (wrapped) {
      if (ts.isIdentifier(wrapped)) {
        return declarations.get(wrapped.text) ?? componentBodyFromInitializer(variableInitializers.get(wrapped.text), declarations, variableInitializers);
      }
      if (ts.isArrowFunction(wrapped) || ts.isFunctionExpression(wrapped)) {
        return wrapped.body;
      }
      if (ts.isCallExpression(wrapped)) {
        return componentBodyFromInitializer(wrapped, declarations, variableInitializers);
      }
    }
  }

  return undefined;
}

function unwrapComponentCall(
  call: ts.CallExpression,
  declarations: Map<string, ts.Node>,
  variableInitializers: Map<string, ts.Expression>,
): ComponentCandidate | undefined {
  if (!isWrapperCall(call, "memo") && !isWrapperCall(call, "forwardRef")) {
    return undefined;
  }

  const wrapped = call.arguments[0];
  if (!wrapped) {
    return undefined;
  }

  if (ts.isIdentifier(wrapped) && isComponentName(wrapped.text)) {
    return {
      name: wrapped.text,
      body: declarations.get(wrapped.text) ?? componentBodyFromInitializer(variableInitializers.get(wrapped.text), declarations, variableInitializers) ?? wrapped,
    };
  }

  if (ts.isCallExpression(wrapped)) {
    return unwrapComponentCall(wrapped, declarations, variableInitializers);
  }

  return undefined;
}

function isWrapperCall(call: ts.CallExpression, wrapperName: "forwardRef" | "memo"): boolean {
  const expression = call.expression;

  if (ts.isIdentifier(expression)) {
    return expression.text === wrapperName;
  }

  return ts.isPropertyAccessExpression(expression) && expression.name.text === wrapperName;
}

function findAuditableRoot(body: ts.Node, config: ComponentIdentityConfig): RootLookup {
  const root = findRootJsxElement(body);
  if (!root) {
    return { kind: "skipped", reason: "non-jsx-root" };
  }

  if (root.kind === "fragment") {
    return findFirstMeaningfulJsxChild(root.node.children, config) ?? { kind: "skipped", reason: "fragment-root" };
  }

  if (isHostElement(root.node.tagName)) {
    return { kind: "auditable", root: root.node };
  }

  if (ts.isIdentifier(root.node.tagName) && config.passThroughComponents.includes(root.node.tagName.text)) {
    return findFirstMeaningfulJsxChild(root.children, config) ?? { kind: "skipped", reason: "custom-root" };
  }

  return { kind: "skipped", reason: "custom-root" };
}

function findRootJsxElement(
  body: ts.Node,
): { kind: "element"; node: ts.JsxOpeningLikeElement; children: ts.NodeArray<ts.JsxChild> } | { kind: "fragment"; node: ts.JsxFragment } | undefined {
  if (ts.isJsxElement(body)) {
    return { kind: "element", node: body.openingElement, children: body.children };
  }

  if (ts.isJsxSelfClosingElement(body)) {
    return { kind: "element", node: body, children: ts.factory.createNodeArray() };
  }

  if (ts.isJsxFragment(body)) {
    return { kind: "fragment", node: body };
  }

  if (ts.isParenthesizedExpression(body)) {
    return findRootJsxElement(body.expression);
  }

  if (ts.isBlock(body)) {
    for (const statement of body.statements) {
      if (ts.isReturnStatement(statement) && statement.expression) {
        return findRootJsxElement(statement.expression);
      }
    }
  }

  return undefined;
}

function findFirstMeaningfulJsxChild(children: ts.NodeArray<ts.JsxChild>, config: ComponentIdentityConfig): RootLookup | undefined {
  for (const child of children) {
    if (ts.isJsxText(child) && child.getText().trim() === "") {
      continue;
    }
    if (ts.isJsxExpression(child)) {
      continue;
    }

    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) {
      return findAuditableRoot(child, config);
    }

    return { kind: "skipped", reason: "fragment-root" };
  }

  return undefined;
}

function auditRootElement(
  sourceFile: ts.SourceFile,
  file: string,
  componentName: string,
  root: ts.JsxOpeningLikeElement,
  config: ComponentIdentityConfig,
): Violation | undefined {
  const expectedValue = componentNameToKebabCase(componentName);
  const attribute = findJsxAttribute(root, config.attribute);
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(root.getStart(sourceFile));

  if (!attribute) {
    return {
      code: "missing-attribute",
      file,
      line: line + 1,
      column: character + 1,
      componentName,
      expectedValue,
      fixable: true,
      message: `${componentName} must set ${config.attribute}="${expectedValue}" on its root DOM element.`,
    };
  }

  const actualValue = getStaticAttributeValue(attribute);
  if (actualValue !== expectedValue) {
    return {
      code: "mismatched-attribute",
      file,
      line: line + 1,
      column: character + 1,
      componentName,
      expectedValue,
      actualValue,
      fixable: actualValue !== undefined,
      message: `${componentName} must use ${config.attribute}="${expectedValue}" on its root DOM element.`,
    };
  }

  return undefined;
}

function fixForViolation(sourceFile: ts.SourceFile, root: ts.JsxOpeningLikeElement, violation: Violation, attributeName: string): TextEdit | undefined {
  if (violation.code === "missing-attribute") {
    return { start: root.tagName.getEnd(), end: root.tagName.getEnd(), text: ` ${attributeName}="${violation.expectedValue}"` };
  }

  const attribute = findJsxAttribute(root, attributeName);
  if (!attribute?.initializer) {
    return undefined;
  }

  return { start: attribute.initializer.getStart(sourceFile), end: attribute.initializer.getEnd(), text: `"${violation.expectedValue}"` };
}

function applyTextEdits(sourceText: string, edits: TextEdit[]): string {
  return [...edits]
    .sort((left, right) => right.start - left.start)
    .reduce((text, edit) => `${text.slice(0, edit.start)}${edit.text}${text.slice(edit.end)}`, sourceText);
}

function findJsxAttribute(root: ts.JsxOpeningLikeElement, attributeName: string): ts.JsxAttribute | undefined {
  return root.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === attributeName,
  );
}

function getStaticAttributeValue(attribute: ts.JsxAttribute): string | undefined {
  if (!attribute.initializer) {
    return undefined;
  }

  if (ts.isStringLiteral(attribute.initializer)) {
    return attribute.initializer.text;
  }

  if (ts.isJsxExpression(attribute.initializer)) {
    const expression = attribute.initializer.expression;
    if (expression && ts.isStringLiteral(expression)) {
      return expression.text;
    }
  }

  return undefined;
}

function skip(file: string, componentName: string, reason: SkippedComponent["reason"]): SkippedComponent {
  const messages: Record<SkippedComponent["reason"], string> = {
    "excluded-component": `${componentName} is excluded by component name rules.`,
    "custom-root": `${componentName} root is a custom component without a pass-through rule.`,
    "fragment-root": `${componentName} has a fragment root with no meaningful DOM child to audit.`,
    "non-jsx-root": `${componentName} does not return a JSX root element.`,
  };

  return { file, componentName, reason, message: messages[reason] };
}

function matchesNamePattern(name: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern === name) {
      return true;
    }

    const source = `^${pattern.replace(/[\\^$+?.()|[\]{}]/g, "\\$&").replace(/\*/g, ".*")}$`;
    return new RegExp(source).test(name);
  });
}

function isHostElement(tagName: ts.JsxTagNameExpression): boolean {
  return ts.isIdentifier(tagName) && /^[a-z]/.test(tagName.text);
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function scriptKindForFile(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (file.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (file.endsWith(".js")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}
