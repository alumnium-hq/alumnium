# TypeScript Style Guide

## Conventions

### Syntax

- Use `function functionName() {}` syntax for defining functions instead of arrow functions, unless the function is a simple one-liner defined as a variable.

- When passing anonymous functions as arguments, prefer using arrow functions unless the function needs to have a name for use inside its body (e.g., for recursion).

- Use `#privateName` for private fields and methods in classes instead of the `private` modifier. Don't add the `public` modifier to public fields or methods, as they are public by default.

### Types

- Avoid using `any` and `as` for type assertions unless absolutely necessary. Always prefer more specific types.

- Use `// @ts-expect-error` comments when needed instead of `// @ts-ignore` to indicate that you expect a TypeScript error in that line. Add a comment pointing out why the error is ignored or expected after `--`, for example, `// @ts-expect-error -- This package is not available in the TypeScript environment`.

### Naming

- Properties and methods should be in camelCase.

- Types, interfaces, and classes should be in PascalCase.

- Constant values should be in UPPER_SNAKE_CASE.

- Module names should be in camelCase, while static files and assets should be in kebab-case.

### Structure

Utilize JavaScript's hoisting behavior and prefer defining private/helper functions on the bottom of the file so that the main exports are more visible at the top of the file.

## Type Checking

Always run the type checker after writing or modifying TypeScript code to ensure that there are no type errors. If you encounter type errors that you cannot resolve, use `// @ts-expect-error` comments to ignore those specific errors, and provide an explanation for why the error is expected or ignored.

To run the type checker, use `bun types` in the corresponding package directory.
