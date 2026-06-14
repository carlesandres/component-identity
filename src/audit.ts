import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { loadConfig } from "./config.js";
import { findCandidateFiles } from "./glob.js";
import { componentNameToKebabCase } from "./naming.js";
import type { AuditOptions, AuditResult, ComponentIdentityConfig, Violation } from "./types.js";

type ComponentCandidate = {
  name: string;
  body: ts.Node;
};

export function audit(options: AuditOptions = {}): AuditResult {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const config = loadConfig(cwd, options.configPath);
  const files = findCandidateFiles(cwd, config.include, config.exclude);
  const violations: Violation[] = [];
  let componentsChecked = 0;

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

    for (const candidate of findExportedComponents(sourceFile)) {
      const root = findRootJsxElement(candidate.body);
      if (!root || !isHostElement(root.tagName)) {
        continue;
      }

      componentsChecked += 1;
      const violation = auditRootElement(sourceFile, file, candidate.name, root, config);
      if (violation) {
        violations.push(violation);
      }
    }
  }

  return {
    ok: violations.length === 0,
    filesChecked: files.length,
    componentsChecked,
    violations,
  };
}

function findExportedComponents(sourceFile: ts.SourceFile): ComponentCandidate[] {
  const candidates: ComponentCandidate[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement) && isComponentName(statement.name.text)) {
      candidates.push({ name: statement.name.text, body: statement.body ?? statement });
      continue;
    }

    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !isComponentName(declaration.name.text) || !declaration.initializer) {
          continue;
        }

        const body = componentBodyFromInitializer(declaration.initializer);
        if (body) {
          candidates.push({ name: declaration.name.text, body });
        }
      }
    }

    if (ts.isExportAssignment(statement)) {
      const candidate = componentFromDefaultExport(statement.expression);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

function componentFromDefaultExport(expression: ts.Expression): ComponentCandidate | undefined {
  if (ts.isIdentifier(expression) && isComponentName(expression.text)) {
    return undefined;
  }

  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return undefined;
  }

  return undefined;
}

function componentBodyFromInitializer(initializer: ts.Expression): ts.Node | undefined {
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    return initializer.body;
  }

  if (ts.isCallExpression(initializer) && isForwardRefCall(initializer)) {
    const render = initializer.arguments[0];
    if (render && (ts.isArrowFunction(render) || ts.isFunctionExpression(render))) {
      return render.body;
    }
  }

  return undefined;
}

function isForwardRefCall(call: ts.CallExpression): boolean {
  const expression = call.expression;

  if (ts.isIdentifier(expression)) {
    return expression.text === "forwardRef";
  }

  return ts.isPropertyAccessExpression(expression) && expression.name.text === "forwardRef";
}

function findRootJsxElement(body: ts.Node): ts.JsxOpeningLikeElement | undefined {
  if (ts.isJsxElement(body)) {
    return body.openingElement;
  }

  if (ts.isJsxSelfClosingElement(body)) {
    return body;
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
      message: `${componentName} must use ${config.attribute}="${expectedValue}" on its root DOM element.`,
    };
  }

  return undefined;
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
