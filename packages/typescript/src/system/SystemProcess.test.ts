import { describe, expect, it, vi } from "vitest";
import { Env } from "../Env.ts";
import { Logger } from "../telemetry/Logger.ts";
import { Tracer } from "../telemetry/Tracer.ts";
import { SystemProcess } from "./SystemProcess.ts";
import { mockBeforeEach } from "../../tests/unit/mocks.ts";

describe("SystemProcess", () => {
  describe("cleanup hooks", () => {
    const { processExit, loggerFlush, tracerFlush } = mockBeforeEach(() => ({
      processExit: vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never),
      loggerFlush: vi.spyOn(Logger, "flush").mockResolvedValue(),
      tracerFlush: vi.spyOn(Tracer, "flush").mockResolvedValue(),
    }));

    it("runs each hook once", async () => {
      const hook = vi.fn();
      SystemProcess.useCleanup(hook);
      SystemProcess.useCleanup(hook);

      process.emit("beforeExit", 0);
      process.emit("beforeExit", 0);

      await vi.waitFor(() => expect(hook).toHaveBeenCalledOnce());
      expect(loggerFlush).toHaveBeenCalledOnce();
      expect(tracerFlush).toHaveBeenCalledOnce();
    });

    it("continues cleanup when a hook fails", async () => {
      const firstHook = vi.fn(() =>
        Promise.reject(new Error("Planned failure")),
      );
      const secondHook = vi.fn();
      SystemProcess.useCleanup(firstHook);
      SystemProcess.useCleanup(secondHook);

      process.emit("beforeExit", 0);

      await vi.waitFor(() => expect(secondHook).toHaveBeenCalledOnce());
      expect(firstHook).toHaveBeenCalledOnce();
    });

    it("exits after cleanup completes", async () => {
      const hook = vi.fn();
      SystemProcess.useCleanup(hook);

      process.emit("SIGINT");
      await vi.waitFor(() => expect(processExit).toHaveBeenCalledWith(0));

      expect(hook).toHaveBeenCalledOnce();
    });

    it("exits when cleanup times out", async () => {
      vi.useFakeTimers();
      vi.spyOn(Env, "ALUMNIUM_SHUTDOWN_TIMEOUT_MS", "get").mockReturnValue(10);
      loggerFlush.mockReturnValue(new Promise(() => {}));

      process.emit("SIGTERM");
      await vi.advanceTimersByTimeAsync(10);

      expect(processExit).toHaveBeenCalledWith(0);
    });

    it("shuts down through the bounded cleanup pipeline", async () => {
      const hook = vi.fn();
      SystemProcess.useCleanup(hook);

      void SystemProcess.shutdown(2);
      await vi.waitFor(() => expect(processExit).toHaveBeenCalledWith(2));

      expect(hook).toHaveBeenCalledOnce();
      expect(loggerFlush).toHaveBeenCalledOnce();
      expect(tracerFlush).toHaveBeenCalledOnce();
    });

    it("exits immediately on a second signal", () => {
      SystemProcess.useCleanup(() => new Promise(() => {}));

      process.emit("SIGINT");
      process.emit("SIGINT");

      expect(processExit).toHaveBeenCalledWith(1);
    });

    it("allows cleanup hooks to be removed", async () => {
      const hook = vi.fn();
      const offHook = SystemProcess.useCleanup(hook);
      offHook();

      process.emit("beforeExit", 0);
      await Promise.resolve();

      expect(hook).not.toHaveBeenCalled();
    });
  });
});
