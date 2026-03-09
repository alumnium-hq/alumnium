import { afterEach, beforeEach, type Mock } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const mocks: Mock<any>[] = [];
const dirs: string[] = [];

export function pushMock(...newMocks: Mock<any>[]) {
  mocks.push(...newMocks);
}

export function createMockDir(prefix: string = "test"): Promise<MockDir> {
  return fs
    .mkdtemp(path.join(os.tmpdir(), `alumnium-${prefix}-`))
    .then((dir) => {
      dirs.push(dir);
      return new MockDir(dir);
    });
}

export class MockDir {
  readonly path: string;

  constructor(dir: string) {
    this.path = dir;
  }

  async list(): Promise<string[]> {
    const files: string[] = [];
    const walk = async (current: string): Promise<void> => {
      const entries = await fs.readdir(current, { withFileTypes: true });
      await Promise.all(
        entries.map((entry) => {
          const filePath = path.join(current, entry.name);
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
    return files;
  }
}

export async function clearAllMocks() {
  mocks.forEach((m) => m.mockRestore());
  mocks.length = 0;

  await Promise.all(dirs.map((dir) => fs.rmdir(dir, { recursive: true })));
  dirs.length = 0;
}

afterEach(async () => {
  mocks.forEach((m) => m.mockRestore());
  mocks.length = 0;

  await Promise.all(dirs.map((dir) => fs.rmdir(dir, { recursive: true })));
  dirs.length = 0;
});

export function mockBeforeEach<Mocks extends Record<string, Mock<any>>>(
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
