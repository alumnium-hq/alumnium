import { describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import z from "zod";
import {
  createMockDir,
  pushTeardown,
  setupBeforeEach,
} from "../tests/mocks.js";
import { FsStore } from "./FsStore.js";

describe("FsStore", () => {
  describe("constructor", () => {
    it("initializes with a directory", () => {
      const dir = "test/store/dir";
      const store = new FsStore(dir);
      expect(store.dir).toBe("test/store/dir");
    });

    it("allows override dir in subclasses", () => {
      const TestStore = class extends FsStore {
        constructor(dir: string) {
          super(dir);
          this.defineDir(() => `overridden/${dir}`);
        }
      };
      const store = new TestStore("test/store/dir");
      expect(store.dir).toBe("overridden/test/store/dir");
    });

    it("allows to define dynamic dir in subclasses", () => {
      const TestStore = class extends FsStore {
        #counter = 0;
        constructor() {
          super(FsStore.DYNAMIC_DIR_SYMBOL);
        }

        override get dir() {
          return `test/dir/${this.#counter}`;
        }

        increment() {
          this.#counter++;
        }
      };

      const store = new TestStore();
      expect(store.dir).toBe("test/dir/0");
      store.increment();
      expect(store.dir).toBe("test/dir/1");
    });
  });

  describe("resolve", () => {
    it("resolves path against base dir", () => {
      const store = new FsStore("test/dir");
      expect(store.resolve("./sub/dir")).toBe("test/dir/sub/dir");
    });
  });

  describe("ensureFilePath", () => {
    const setup = setupBeforeEach(async () => {
      const mockDir = await createMockDir();
      const store = new FsStore(mockDir.path);
      const relFilePath = "sub/dir/file.txt";
      const result = await store.ensureFilePath(relFilePath);
      return { mockDir, relFilePath, result };
    });

    it("resolves file path", async () => {
      const { mockDir, relFilePath, result } = setup.cur;
      expect(result).toBe(path.resolve(mockDir.path, relFilePath));
    });

    it("creates file dir", async () => {
      const { result } = setup.cur;
      expect(fs.stat(path.dirname(result))).resolves.toMatchObject({
        size: expect.any(Number),
      });
    });

    it("does't create file", async () => {
      const { result } = setup.cur;
      expect(fs.stat(result)).rejects.toThrow("ENOENT");
    });
  });

  describe("ensureDir", () => {
    const setup = setupBeforeEach(async () => {
      const mockDir = await createMockDir();
      const store = new FsStore(mockDir.path);
      const relDirPath = "sub/dir";
      const result = await store.ensureDir(relDirPath);
      return { mockDir, relDirPath, result };
    });

    it("resolves dir path", async () => {
      const { mockDir, relDirPath, result } = setup.cur;
      expect(result).toBe(path.resolve(mockDir.path, relDirPath));
    });

    it("creates dir", async () => {
      const { result } = setup.cur;
      expect(fs.stat(result)).resolves.toMatchObject({
        isDirectory: expect.any(Function),
      });
    });
  });

  describe("writeJson", () => {
    const setup = setupBeforeEach(async () => {
      const mockDir = await createMockDir();
      const store = new FsStore(mockDir.path);
      const relFilePath = "sub/dir/file.json";
      const data = { key: "value" };
      const result = await store.writeJson(relFilePath, data);
      return { mockDir, relFilePath, data, result };
    });

    it("resolves file path", async () => {
      const { mockDir, relFilePath, result } = setup.cur;
      expect(result).toBe(path.resolve(mockDir.path, relFilePath));
    });

    it("writes JSON data to file", async () => {
      const { result, data } = setup.cur;
      const fileContent = await fs.readFile(result, "utf-8");
      expect(JSON.parse(fileContent)).toEqual(data);
    });
  });

  describe("writeFile", () => {
    const setup = setupBeforeEach(async () => {
      const mockDir = await createMockDir();
      const store = new FsStore(mockDir.path);
      return { mockDir, store };
    });

    it("resolves file path", async () => {
      const { mockDir, store } = setup.cur;
      const relFilePath = "sub/dir/file.txt";
      const result = await store.writeFile(relFilePath, "Hello, world!");
      expect(result).toBe(path.resolve(mockDir.path, relFilePath));
    });

    it("writes string data to file", async () => {
      const { mockDir, store } = setup.cur;
      const result = await store.writeFile("sub/dir/file.txt", "Hello, world!");
      const content = await fs.readFile(result, "utf-8");
      expect(content).toBe("Hello, world!");
    });

    it("writes buffer data to file", async () => {
      const { mockDir, store } = setup.cur;
      const buf = Buffer.from("Hello, buffer!");
      const result = await store.writeFile("sub/dir/file.bin", buf);
      const content = await fs.readFile(result);
      expect(content).toEqual(buf);
    });
  });

  describe("readText", () => {
    const setup = setupBeforeEach(async () => {
      const mockDir = await createMockDir();
      const store = new FsStore(mockDir.path);
      return { mockDir, store };
    });

    it("reads text content from file", async () => {
      const { mockDir, store } = setup.cur;
      const filePath = path.resolve(mockDir.path, "file.txt");
      await fs.writeFile(filePath, "Hello, world!");
      const content = await store.readText("file.txt");
      expect(content).toBe("Hello, world!");
    });

    it("returns null if file doesn't exist", async () => {
      const { store } = setup.cur;
      const content = await store.readText("nonexistent.txt");
      expect(content).toBeNull();
    });
  });

  describe("readJson", () => {
    const setup = setupBeforeEach(async () => {
      const mockDir = await createMockDir();
      const store = new FsStore(mockDir.path);
      return { mockDir, store };
    });

    it("reads JSON content from file", async () => {
      const { mockDir, store } = setup.cur;
      const filePath = path.resolve(mockDir.path, "file.json");
      const data = { key: "value" };
      await fs.writeFile(filePath, JSON.stringify(data));
      const content = await store.readJson("file.json");
      expect(content).toEqual(data);
    });

    it("returns null if file doesn't exist", async () => {
      const { store } = setup.cur;
      const content = await store.readJson("nope.json");
      expect(content).toBeNull();
    });

    it("throws if file content is not valid JSON", async () => {
      const { mockDir, store } = setup.cur;
      const filePath = path.resolve(mockDir.path, "invalid.json");
      await fs.writeFile(filePath, "Not a JSON string");
      expect(store.readJson("invalid.json")).rejects.toThrow();
    });

    it("allows to parse using zod schema", async () => {
      const { mockDir, store } = setup.cur;
      const Schema = z.object({ name: z.string() });
      const filePath = path.resolve(mockDir.path, "data.json");
      const data = { name: "Alice", age: 30 };
      await fs.writeFile(filePath, JSON.stringify(data));
      const content = await store.readJson("data.json", Schema);
      expect(content).toEqual({ name: "Alice" });
    });

    it("throws if content doesn't match zod schema", async () => {
      const { mockDir, store } = setup.cur;
      const Schema = z.object({ name: z.string() });
      const filePath = path.resolve(mockDir.path, "data.json");
      const data = { age: 30 };
      await fs.writeFile(filePath, JSON.stringify(data));
      expect(store.readJson("data.json", Schema)).rejects.toThrow();
    });
  });

  describe("clear", () => {
    const setup = setupBeforeEach(async () => {
      const mockDir = await createMockDir();
      const store = new FsStore(mockDir.path);
      return { mockDir, store };
    });

    it("removes the store directory with all contents", async () => {
      const { mockDir, store } = setup.cur;
      const filePath = await store.writeFile("sub/dir/file.txt", "Hello");
      expect(fs.stat(filePath)).resolves.toMatchObject({
        size: expect.any(Number),
      });
      await store.clear();
      expect(fs.stat(mockDir.path)).rejects.toThrow("ENOENT");
    });

    it("doesn't throw if directory doesn't exist", async () => {
      const { mockDir, store } = setup.cur;
      await fs.rmdir(mockDir.path, { recursive: true });
      await store.clear();
      await expect(store.clear()).resolves.toBeUndefined();
    });
  });

  describe("subStore", () => {
    const setup = setupBeforeEach(async () => {
      const mockDir = await createMockDir();
      const store = new FsStore(mockDir.path);
      return { mockDir, store };
    });

    it("creates sub-store with resolved directory", () => {
      const { mockDir, store } = setup.cur;
      const subStore = store.subStore("sub/dir");
      expect(subStore.dir).toBe(path.resolve(mockDir.path, "sub/dir"));
    });

    it("throws if subdirectory path is absolute", () => {
      const { store } = setup.cur;
      expect(() => store.subStore("/absolute/path")).toThrow(
        "Subdirectory path '/absolute/path' must be relative to the store directory",
      );
    });
  });

  describe("FsStore.subStore", () => {
    it("creates nested sub-stores with env var param", async () => {
      const subStore = FsStore.subStore("sub/dir", "default/dir");
      expect(subStore.dir).toBe("sub/dir");
    });

    it("falls back to the default dir within global dir if the env var is undefined", () => {
      const subStore = FsStore.subStore(undefined, "default/dir");
      expect(subStore.dir).toBe(".alumnium/default/dir");
    });

    it("respects empty env var string", () => {
      const subStore = FsStore.subStore("", "default/dir");
      expect(subStore.dir).toBe("");
    });
  });

  describe("FsStore.globalSubDir", () => {
    it("returns a subdirectory path under the global store directory", () => {
      const result = FsStore.globalSubDir("sub/dir");
      expect(result).toBe(".alumnium/sub/dir");
    });

    it("allows to override global store directory via env var", () => {
      process.env.ALUMNIUM_STORE_DIR = ".custom";
      pushTeardown(() => {
        delete process.env.ALUMNIUM_STORE_DIR;
      });
      const result = FsStore.globalSubDir("sub/dir");
      expect(result).toBe(".custom/sub/dir");
    });
  });

  describe("FsStore.globalDir", () => {
    it("returns the default global store directory", () => {
      expect(FsStore.globalDir).toBe(".alumnium");
    });

    it("allows to override global store directory via env var", () => {
      process.env.ALUMNIUM_STORE_DIR = ".custom";
      pushTeardown(() => {
        delete process.env.ALUMNIUM_STORE_DIR;
      });
      expect(FsStore.globalDir).toBe(".custom");
    });
  });
});
