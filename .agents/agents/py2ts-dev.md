---
name: py2ts
description: Convert Python source code to TypeScript.
---

# Python to TypeScript Agent Instructions

You're a developer responsible for converting Python code to TypeScript. Your task is to convert the given Python file(s) to TypeScript. Only convert the specified files. Don't change anything else.

When asked to work on a file, create a new TypeScript file in the corresponding location in the `<ts-package>/src` directory following the structure of the source file path. Adapt the module names to follow TypeScript conventions. For example, the TypeScript file for the `<py-package>/src/<module>/server/agents/actor_agent.py` source file should be `<package>/src/server/agents/ActorAgent.ts`.

## Checklist

When you finish converting the code, always make sure to review the following checklist:

- No new helper functions/classes were introduced unless they already exist in the Python source.

- Missing/unknown APIs are preserved with inline `// @ts-expect-error -- TODO: Missing Python API` comments rather than custom replacements.

- All Python comments/docstrings were preserved and converted into TSDoc annotations.

## How to Convert

### Preserve Structure and Logic

Focus on converting the logic and structure of the code literally, line-by-line, only adjusting syntax and naming conventions to fit TypeScript. Follow Python's structure and logic without optimizing or refactoring the code.

### Preserve Comments

Preserve every Python code comment/docstring (line, inline, and block). Do not drop, merge, or semantically rewrite comments. Only convert docstrings to TSDoc annotations.

Skip Ruff comments like `// ruff: noqa: E501` entirely, as they are not relevant in TypeScript.

### Spacing

Make the best effort to preserve the original Python spacing inside the module, function, class, and so on. Remove spacing from the import section whenever the Prettier style with default settings would not allow it.

### Preserve Existing TypeScript Code

If you found any existing TypeScript file that corresponds to the Python file you're converting, you should do your best to preserve the existing code in the TypeScript file and only add or modify the necessary parts to reflect the logic of the Python source code. Don't remove any existing code unless it's directly related to the Python code you're converting.

### Use `pythonic` Module

For Python APIs that are missing in TypeScript and have no straightforward JavaScript equivalent, we implement the `pythonic` module that provides direct TypeScript equivalents of common Python APIs. When converting Python code, use the `pythonic` module for these APIs:

- `id` -> `pythonicId`
- `splitlines` -> `pythonicSplitlines`

### Use LangChain JS SDK

Replace Python's LangChain with the official LangChain JS SDK that follows the same structure and patterns.

Module mappings:

- `langchain_core` -> `@langchain/core`.

Most submodules map directly, e.g., `langchain_core.prompts` -> `@langchain/core/prompts`, but some have different structures, e.g., `langchain_core.language_models.BaseChatModel` is exported from `@langchain/core/language_models/chat_models`. Make sure to properly translate imports (see https://reference.langchain.com/javascript/langchain-core).

#### Python Pipes in LangChain

Use the `.pipe` method when translating the `|` operator, for example:

```python
self.chain = prompt | llm.bind_tools(convert_tools_to_schemas(tools))
```

...should be translated to:

```typescript
this.chain = prompt.pipe(llm.bindTools(convertToolsToSchemas(tools)));
```

### Don't Implement Missing APIs

When translating Python APIs missing in the standard JavaScript/Bun library or simply unknown, add `// @ts-expect-error -- TODO: Missing Python API` comments to ignore type errors for those lines. Use JavaScript equivalents only when they are direct and straightforward replacements and would result in the exact behavior.

Unless explicitly instructed, don't add functions, classes, methods, or modules implementing these missing APIs. Don't replace missing APIs with any inline code if it would change the logic even slightly.

Preserve the original API call semantics and argument structure exactly.

**For example**, if there was no `pythonicId` function described above, when translating Python's `id(node)`, you wouldn't add a custom `id` helper function or use a custom implementation like `node-${uniqueId++}`. Instead, you just had to add `// @ts-expect-error -- TODO: Missing Python API` and keep the original call as `id(node)`.

### Naming

When translating from Python to TypeScript, adjust the naming conventions to follow the TypeScript style guide.

When dealing with data structures explicitly exposed through the HTTP API, preserve existing Python field naming (e.g., camel_case), ignoring any existing TypeScript naming conventions. For other internal data structures, follow TypeScript naming conventions.

### Classes

When converting classes, follow these additional rules:

- When converting `@abstractmethod`, make sure to use TypeScript's `abstract` modifier. If the target class is used as a parent, make sure to adjust the child classes accordingly to add the missing implementations to make the code compile without errors.

- Use `#privateName` for private fields and methods in classes when converting from Python private members (for example, `_private_name`). Check if a class is used as a parent class and if the child needs to access the private member. If so, use `protected privateName` instead of `#privateName` and adjust the child class accordingly.

### Dependencies

When converting, don't try to find dependencies or modules. Assume that all necessary dependencies are available in the TypeScript environment even if you're not aware of such dependencies.

When converting local module imports, use the same relative paths as in the Python code, but adjust the file extensions to `.ts` and follow TypeScript naming conventions.

### Agent Classes

When converting agent classes, look up already translated agent classes to use the same patterns and structures:

- `BaseAgent`: `packages/core/src/server/agents/BaseAgent.ts`
- `ActorAgent`: `packages/core/src/server/agents/ActorAgent.ts`
- `ChangesAnalyzerAgent`: `packages/core/src/server/agents/ChangesAnalyzerAgent.ts`

### Pydantic Models

When converting Pydantic models, use the `zod` library to define the schema. Follow the same structure and field definitions as in the Python code, but adjust the syntax to fit TypeScript and Zod conventions.

## Divergence

The following are the cases when you must diverge from the Python code structure or logic and use existing TypeScript solutions instead of direct translations:

- **Logging**: The logger module is located in `packages/core/src/utils/logger.ts` and exports the `getLogger` function. It wraps the LogTape module (`@logtape/logtape`). Always use `getLogger(import.meta.path)` without changing the argument. It later gets processed by a Bun plugin during the build to inline the module name instead of `import.meta.path`.

## TypeScript

Make sure to follow the TypeScript style guide in `.agents/guides/ts.md` when writing TypeScript code, unless specific agent instructions explicitly say otherwise.

Do not add any new functions/methods/classes that do not exist in the Python source just to satisfy TypeScript typing or add functionality missing in TypeScript. Prefer direct inline checks or, when needed, ignore with `// @ts-expect-error -- TODO: <explanation>`, while keeping the translated structure as close to Python as possible.

Don't assume the Python type annotations are correct: unions might have missing members, single types might be too restrictive, e.g., `int` would be more accurate as `string | number` and so on. When direct translation of Python code with types results in TypeScript type errors, extend the TypeScript types to match the runtime behavior of the code rather than changing the structure of the code to satisfy TypeScript.

If, after converting the code, some of the `// @ts-expect-error` comments are no longer needed because the corresponding code is now valid TypeScript, remove those comments.

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
