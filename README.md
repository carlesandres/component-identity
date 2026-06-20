# @carlesandres/component-identity

Audit exported React components for a canonical `data-component` root attribute.

The convention is intentionally strict:

```tsx
export function UserMenu() {
  return <div data-component="user-menu" />;
}
```

`UserMenu` maps to `data-component="user-menu"`. The mapping is one-to-one and uses kebab-case derived from the component name.

## Install

```sh
npm install --save-dev @carlesandres/component-identity
```

## Use

After installing the package, add a config file:

```sh
npx component-identity init
npx component-identity init --preset next
```

Run the audit:

```sh
npx component-identity audit
```

Use JSON output for CI, reports, or agent tooling:

```sh
npx component-identity report
npx component-identity audit --json
```

For one-off use without installing first, use the scoped package name:

```sh
npx @carlesandres/component-identity audit
```

The audit exits with code `1` when violations are found, so it can be used directly in CI.

```json
{
  "scripts": {
    "audit:components": "component-identity audit"
  }
}
```

## What It Checks

The MVP checks named exported React components that return a root host DOM element:

```tsx
export function UserMenu() {
  return <div data-component="user-menu" />;
}

export const AccountCard = () => {
  return <section data-component="account-card" />;
};
```

It supports exported components declared as:

- `export function ComponentName() { ... }`
- `export const ComponentName = () => ...`
- `export default function ComponentName() { ... }`
- `const ComponentName = () => ...; export default ComponentName`
- `const ComponentName = () => ...; export { ComponentName }`
- `memo(ComponentName)` and nested `forwardRef(memo(...))` wrappers

```tsx
export const Button = forwardRef<HTMLButtonElement>((props, ref) => {
  return <button ref={ref} data-component="button" {...props} />;
});
```

Fragments are audited through their first meaningful JSX DOM child. Empty fragments are reported as skipped with a `fragment-root` reason.

It ignores private components and reports skipped exported components whose root is another custom component or a non-JSX expression such as a portal call. Custom component roots can be treated as pass-through wrappers with `passThroughComponents`.

## Autofix

Simple missing or mismatched static root attributes can be fixed in place:

```sh
npx component-identity audit --fix
```

## Config

`component-identity.config.json`:

```json
{
  "attribute": "data-component",
  "include": [
    "src/**/*.{ts,tsx,js,jsx}",
    "app/**/*.{ts,tsx,js,jsx}",
    "components/**/*.{ts,tsx,js,jsx}"
  ],
  "exclude": [
    "**/components/ui/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/*.stories.*",
    "**/*.d.ts",
    "**/node_modules/**",
    "**/dist/**"
  ],
  "excludeFiles": [],
  "excludeComponents": [],
  "passThroughComponents": []
}
```

Use `--config` to point at another config file and `--cwd` to audit a different directory. `excludeFiles` is an alias for additional file globs; `excludeComponents` accepts exact component names or `*` wildcards.

Use `"preset": "next"`, `npx component-identity init --preset next`, or the exported `nextConfig` for Next.js projects. It extends the default excludes with app/page entry files such as pages, layouts, loading, error, and not-found files, while keeping tests, stories, and `components/ui` excluded.

JSON reports include coverage fields: `componentsFound`, `componentsChecked`, `components`, `auditedComponents`, `skippedComponents`, `fixesApplied`, and `violations`.

## Library API

```ts
import { audit, componentNameToKebabCase } from "@carlesandres/component-identity";

const result = audit({ cwd: process.cwd() });

if (!result.ok) {
  console.log(result.violations);
}

console.log(componentNameToKebabCase("UserMenu")); // "user-menu"
```

## Versioning And Publishing

This package is designed for normal npm versioning:

```sh
npm run check
npm test
npm run pack:dry
npm run version:patch
npm run publish:public
```

`npm run prepack` builds `dist/` before packaging.

## Contributions

This project is in a very early stage. For now, issues are accepted as contributions, but pull requests are not.
