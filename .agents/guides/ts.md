# TypeScript Style Guide

## Conventions

### Syntax

- Use `function functionName() {}` syntax for defining functions instead of arrow functions, unless the function is a simple one-liner defined as a variable.

- When passing anonymous functions as arguments, prefer using arrow functions unless the function needs to have a name for use inside its body (e.g., for recursion).

- Use `#privateName` for private fields and methods in classes instead of the `private` modifier. Don't add the `public` modifier to public fields or methods, as they are public by default.

- Prefer using plain objects `{}` for string/number-to-value mappings instead of `Map` unless you need the specific features of `Map` (e.g., ordered keys, non-string keys).

- Prefer using simple checks like `obj[key]` or `key in obj` rather than `Object.hasOwn(obj, key)`. Use the simplest/generic way appropriate for the context.

- Prefer `String(value)` over `${value}` for converting values to strings when the value is not being embedded in a larger string.

### Defensiveness

- Don't add explicit conversions, i.e., `String(number)` when using in a context where conversion is implicit, e.g., `${number} users` or `obj[number]`.

- Rely on TypeScript type checking and Zod parsing rather than adding extra runtime checks or conversions.

### Verbosity

Be concise and avoid unnecessary verbosity. Never assume that code runs on legacy runtimes. For example, `Number.parseInt(rawId, 10)` is unnecessary in JavaScript/TypeScript, as `parseInt(rawId)` is as sufficient.

Don't be unnecessarily explicit or add redundant code that doesn't add value. For example, instead of `if (properties.length > 0)` write it as `if (properties.length)`.

### Types

- Avoid using `any` and `as` for type assertions unless absolutely necessary. Always prefer more specific types.

- Use `// @ts-expect-error` comments when needed instead of `// @ts-ignore` to indicate that you expect a TypeScript error in that line. Add a comment pointing out why the error is ignored or expected after `--`, for example, `// @ts-expect-error -- This package is not available in the TypeScript environment`.

### Naming

- Properties and methods should be in camelCase.

- Types, interfaces, and classes should be in PascalCase.

- Constant values should be in UPPER_SNAKE_CASE.

- Module names should match the exports. For example, if the main module exports is `ActorAgent`, the file should be named `ActorAgent.ts`. If the module exports a bunch of functions, it should be in camelCase.

- Static files and assets should be in kebab-case.

### Structure

Utilize JavaScript's hoisting behavior and prefer defining private/helper functions on the bottom of the file so that the main exports are more visible at the top of the file.

## Type Checking

Always run the type checker after writing or modifying TypeScript code to ensure that there are no type errors. If you encounter type errors that you cannot resolve, use `// @ts-expect-error` comments to ignore those specific errors, and provide an explanation for why the error is expected or ignored.

To run the type checker, use `bun types` in the corresponding package directory.

## Standard Library

Prefer using built-in features of Bun and the standard JavaScript library whenever possible. Don't add dependencies or helper functions for functionality that can be achieved with built-in features, unless the built-in features are not sufficient for the task at hand.
