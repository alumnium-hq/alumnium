---
name: py2ts
description: Convert Python source code to TypeScript.
---

## Instructions

You're a developer responsible for converting Python code to TypeScript. Your task is to convert the given Python file(s) to TypeScript. Only convert the specified files. Don't change anything else.

When asked to work on a file, create a new TypeScript file in the corresponding location in the `<ts-package>/src` directory following the structure of the source file path. Adapt the module names to follow TypeScript conventions. For example, the TypeScript file for the `<py-package>/src/<module>/server/agents/actor_agent.py` source file should be `<package>/src/server/agents/actorAgent.ts`.

### Structure and Logic

Focus on converting the logic and structure of the code literally, only adjusting syntax and conventions to fit TypeScript. Follow Python's structure and logic without optimizing or refactoring the code. The initial goal, unless specified otherwise, is to achieve a direct translation of the Python code to TypeScript, preserving the original logic and structure as much as possible.

If you found any existing TypeScript file that corresponds to the Python file you're converting, you should do your best to preserve the existing code in the TypeScript file and only add or modify the necessary parts to reflect the logic of the Python source code. Don't remove any existing code unless it's directly related to the Python code you're converting.

### Comments

Preserve all code and documentation comments, converting them to the appropriate format for TypeScript. For example, Python docstrings should be converted to TSDoc comments in TypeScript.

### Naming

Properties and methods should be in camelCase. Types, interfaces, and classes should be in PascalCase. Module names should be in camelCase, while static files and assets should be in kebab-case.

When dealing with data structures explicitly exposed through the HTTP API, preserve existing Python field naming, ignoring any existing TypeScript naming conventions. For other internal data structures, follow TypeScript naming conventions.

### Missing APIs

When encountering APIs missing in the standard library or simply unknown, add `// @ts-expect-error` comments to ignore type errors for those lines. Keep the original logic as much as possible. Don't try to implement those APIs unless explicitly instructed to do so.

Don't add functions, classes, methods, or modules implementing these missing APIs.

Preserve the original arguments of these APIs so later we can quickly get the idea of what the API is supposed to do and implement it in TypeScript later if needed. For example, `.splitlines(keepends=True)` must be converted to `.splitlines({ keepends: true })` instead of `.splitlines(true)`.

### Dependencies

When converting, don't try to find dependencies or modules. Assume that all necessary dependencies are available in the TypeScript environment even if you're not aware of such dependencies.

When converting local module imports, use the same relative paths as in the Python code, but adjust the file extensions to `.ts` and follow TypeScript naming conventions.

## TypeScript

- Make sure to follow the TypeScript style guide in `.agents/guides/ts.md` when writing TypeScript code, unless subagent instructions explicitly say otherwise.

- Whenever possible, prefer using built-in features of Bun.

- Use the strictest mode of TypeScript to ensure type safety. Don't use `any` or `as` unless absolutely necessary.

- Ignore missing imports and APIs without Bun/Node.js equivalents using `// @ts-expect-error` comments.

## Tests

- Use Bun's built-in testing framework for writing tests in TypeScript.

- Place test files in the same directory as the source files, with the `.test.ts` extension. For example, if the original Python test file is `<py-package>/tests/server/test_server.py` and the target TypeScript file is `<ts-package>/src/server/index.ts`, the corresponding test file should be `<ts-package>/src/server/index.test.ts`.

- Copy Python fixtures to a `__fixtures__` subdirectory within the same directory as the TypeScript test file. When a fixture is used in multiple test files, find the top common directory and place the fixture in a `__fixtures__` subdirectory there.

- When converting test files, assume that these will initially fail. So add `.todo` (e.g., `it.todo` or `describe.todo`) to the newly created test cases to indicate that these tests are expected to fail until the corresponding TypeScript code is fully implemented and working.

- When the tested code contains a missing dependency, add it to `<ts-package>/tests/py2ts.ts` that is preloaded before running the tests (using `bun test --preload ./tests/py2ts.ts`). It ensures that the tests can run without errors even if the tested code contains missing dependencies.

After you finish converting the code, run the tests via `bun run test` to check which ones are failing. Don't try to fix the failing tests unless explicitly instructed to do so. The main goal of this task is to convert the code, not to make it fully functional. As instructed, use `.todo` to make all the tests pass.

## Packages Map

Here are the mappings for the existing packages:

- `packages/python/src/alumnium` -> `packages/core/src`
