import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, type Mock, type MockInstance, vi } from "vitest";
import { safePathJoin } from "../../src/utils/fs.ts";

export type TeardownFn = () => void | Promise<void>;

export type AnyMock = MockInstance<any> | Mock<any>;

const mocks: AnyMock[] = [];
const dirs: string[] = [];
const teardowns: TeardownFn[] = [];

export function pushMock(...newMocks: AnyMock[]) {
  mocks.push(...newMocks);
}

export namespace createMockDir {
  export interface Props {
    prefix?: string | undefined;
    preserve?: boolean | undefined;
  }
}

export function createMockDir(props?: createMockDir.Props): Promise<MockDir> {
  const { preserve, prefix = "test" } = props || {};
  return fs
    .mkdtemp(safePathJoin(os.tmpdir(), `alumnium-${prefix}-`))
    .then((dir) => {
      if (!preserve) dirs.push(dir);
      return new MockDir(dir);
    });
}

export class MockDir {
  readonly path: string;

  constructor(dir: string) {
    this.path = dir;
  }

  async flatTree(): Promise<string[]> {
    const files: string[] = [];
    const walk = async (current: string): Promise<void> => {
      const entries = await fs.readdir(current, { withFileTypes: true });
      await Promise.all(
        entries.map((entry) => {
          const filePath = safePathJoin(current, entry.name);
          if (entry.isDirectory()) {
            return walk(filePath);
          } else {
            const relPath = path.relative(this.path, filePath);
            files.push(relPath);
          }
        }),
      );
    };
    await walk(this.path);
    return files.toSorted();
  }

  readText(relPath: string): Promise<string> {
    const filePath = safePathJoin(this.path, relPath);
    return fs.readFile(filePath, "utf-8");
  }

  async readJson<Type = unknown>(relPath: string): Promise<Type> {
    const text = await this.readText(relPath);
    return JSON.parse(text) as Type;
  }
}

export async function clearAllMocks() {
  mocks.forEach((m) => m.mockRestore());
  mocks.length = 0;

  await Promise.all(
    dirs.map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
  dirs.length = 0;

  teardowns.forEach((fn) => fn());
  teardowns.length = 0;

  vi.restoreAllMocks();
}

export function mockBeforeEach<Mocks extends Record<string, MockInstance<any>>>(
  fn: () => Mocks,
) {
  const mocksRef = { cur: {} as Mocks };

  beforeEach(() => {
    const newMocks = fn();
    mocksRef.cur = newMocks;
    pushMock(...Object.values(newMocks));
  });

  return mocksRef;
}

export interface HookRef<Type> {
  cur: Type;
}

export function setupBeforeEach<Result>(
  fn: () => Promise<Result> | Result,
): HookRef<Result> {
  const ref: HookRef<Result> = { cur: {} as Result };

  beforeEach(async () => {
    ref.cur = await fn();
  });

  return ref;
}

export function pushTeardown(fn: TeardownFn) {
  teardowns.push(fn);
}
