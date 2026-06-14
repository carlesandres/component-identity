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

Add a config file:

```sh
npx component-identity init
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

The audit exits with code `1` when violations are found, so it can be used directly in CI.

```json
{
  "scripts": {
    "audit:components": "component-identity audit"
  }
}
```

## What v0.1 Checks

The MVP checks exported React components that return a root host DOM element:

```tsx
export function UserMenu() {
  return <div data-component="user-menu" />;
}

export const AccountCard = () => {
  return <section data-component="account-card" />;
};
```

It also supports simple `forwardRef` wrappers:

```tsx
export const Button = forwardRef<HTMLButtonElement>((props, ref) => {
  return <button ref={ref} data-component="button" {...props} />;
});
```

The MVP intentionally ignores components whose root is another custom component, a fragment, a portal, or an `asChild` pattern.

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
  ]
}
```

Use `--config` to point at another config file and `--cwd` to audit a different directory.

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
