import { beforeEach, describe, expect, it, vi } from "vitest";
import { pushMock } from "../../tests/unit/mocks.ts";
import type { Http } from "../Http.ts";
import { ActorAgent } from "./agents/ActorAgent.ts";
import { AreaAgent } from "./agents/AreaAgent.ts";
import { ChangesAnalyzerAgent } from "./agents/ChangesAnalyzerAgent.ts";
import { LocatorAgent } from "./agents/LocatorAgent.ts";
import { PlannerAgent } from "./agents/PlannerAgent.ts";
import { RetrieverAgent } from "./agents/RetrieverAgent.ts";
import { LlmFactory } from "./LlmFactory.ts";
import { serverApp } from "./serverApp.ts";
import { CreateSessionResponse } from "./serverSchema.ts";
import { SessionManager } from "./session/SessionManager.ts";

describe("serverApp", () => {
  beforeEach(() => {
    serverApp.store.sessions = new SessionManager();

    pushMock(
      vi.spyOn(LlmFactory, "createLlm").mockReturnValue({
        withStructuredOutput: () => ({ invoke: async () => ({}) }),
        bindTools: () => ({ invoke: async () => ({}) }),
        invoke: async () => ({ content: "" }),
      } as any),

      vi
        .spyOn(PlannerAgent.prototype, "invoke")
        .mockResolvedValue([
          "Explanation",
          [
            "Step 1: Click New Todo Input field",
            "Step 2: Enter 'Buy milk'",
            "Step 3: Press Enter",
          ],
        ]),

      vi.spyOn(ActorAgent.prototype, "invoke").mockResolvedValue([
        "Clicking the element and typing text",
        [
          { name: "click", args: { id: 2 } },
          { name: "type", args: { id: 2, text: "Buy milk" } },
        ],
      ]),

      vi
        .spyOn(RetrieverAgent.prototype, "invoke")
        .mockResolvedValue([
          "Found the requested information in the accessibility tree",
          "true",
        ]),

      vi.spyOn(AreaAgent.prototype, "invoke").mockResolvedValue({
        id: 3,
        explanation: "Found the TODO list area",
      }),

      vi
        .spyOn(LocatorAgent.prototype, "invoke")
        .mockResolvedValue([
          { id: 16, explanation: "Found the checkbox element" },
        ]),

      vi
        .spyOn(ChangesAnalyzerAgent.prototype, "invoke")
        .mockResolvedValue("Button text changed from 'Click me' to 'Submit'."),
    );
  });

  describe("GET /health", () => {
    it("responds with health status", async () => {
      const response = await serverApp.handle(createRequest("GET", "/health"));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "healthy" });
    });
  });

  describe("POST /sessions", () => {
    it("validates payload", async () => {
      const emptyBodyResponse = await serverApp.handle(
        createRequest("POST", "sessions", {}),
      );
      expect(emptyBodyResponse.status).toBe(500);
      expect(await emptyBodyResponse.json()).toEqual({
        message: expect.stringMatching("Error"),
        stack: expect.any(String),
      });
    });

    it("creates concurrent sessions", async () => {
      const sessionIds: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const response = await serverApp.handle(
          createRequest("POST", "/sessions", {
            provider: "anthropic",
            name: `test-model-${i}`,
            platform: "chromium",
            tools: getSampleToolSchemas(),
          }),
        );
        expect(response.status).toBe(200);
        const data = CreateSessionResponse.parse(await response.json());
        sessionIds.push(data.session_id);
      }

      const response = await serverApp.handle(
        createRequest("GET", "/sessions"),
      );
      expect(await response.json()).toEqual([...sessionIds]);
    });
  });

  describe("GET /sessions", () => {
    it("responds with sessions lists", async () => {
      const sessionId = await createSession();
      const response = await serverApp.handle(
        createRequest("GET", "/sessions"),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([sessionId]);
    });
  });

  describe("DELETE /sessions/:session_id", () => {
    it("deletes sessions", async () => {
      const sessionId = await createSession();
      const response = await serverApp.handle(
        createRequest("DELETE", `/sessions/${sessionId}`),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toBe(true);
    });

    it("responds with 404 when session does not exist", async () => {
      const response = await serverApp.handle(
        createRequest("DELETE", "/sessions/nonexistent"),
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        message: "Session not found",
      });
    });
  });

  describe("GET /sessions/:session_id/stats", () => {
    it("responds with session stats", async () => {
      const sessionId = await createSession();
      const response = await serverApp.handle(
        createRequest("GET", `/sessions/${sessionId}/stats`),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        cache: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          cache_creation: 0,
          cache_read: 0,
          reasoning: 0,
        },
        total: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          cache_creation: 0,
          cache_read: 0,
          reasoning: 0,
        },
      });
    });

    it("responds with 404 when session does not exist", async () => {
      const response = await serverApp.handle(
        createRequest("GET", "/sessions/nonexistent/stats"),
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        message: "Session not found",
      });
    });
  });

  describe("POST /sessions/:session_id/plans", () => {
    it("plans actions", async () => {
      const sessionId = await createSession();
      const response = await serverApp.handle(
        createRequest("POST", `/sessions/${sessionId}/plans`, {
          app: "test",
          goal: "fill out the login form",
          accessibility_tree: sampleAccessibilityTree,
          url: "https://example.com/login",
          title: "Login Page",
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        explanation: "Explanation",
        steps: [
          "Step 1: Click New Todo Input field",
          "Step 2: Enter 'Buy milk'",
          "Step 3: Press Enter",
        ],
      });
    });

    it("responds with 404 when session does not exist", async () => {
      const response = await serverApp.handle(
        createRequest("POST", `/sessions/nonexistent/plans`, {
          app: "test",
          goal: "click submit button",
          accessibility_tree: sampleAccessibilityTree,
        }),
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        message: "Session not found",
      });
    });

    it("validates payload", async () => {
      const sessionId = await createSession();
      const response = await serverApp.handle(
        createRequest("POST", `/sessions/${sessionId}/plans`, {
          goal: "click button",
        }),
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        message: expect.stringMatching("Error"),
        stack: expect.any(String),
      });
    });
  });

  describe("POST /sessions/:session_id/steps", () => {
    it("executes step actions", async () => {
      const sessionId = await createSession();
      const response = await serverApp.handle(
        createRequest("POST", `/sessions/${sessionId}/steps`, {
          app: "test",
          goal: "create 'Buy milk' todo item",
          step: "click New Todo Input field",
          accessibility_tree: sampleAccessibilityTree,
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        actions: [
          { args: { id: 9 }, name: "click" },
          { args: { id: 9, text: "Buy milk" }, name: "type" },
        ],
        explanation: "Clicking the element and typing text",
      });
    });
  });

  describe("POST /sessions/:session_id/statements", () => {
    it("executes statement", async () => {
      const sessionId = await createSession();
      const response = await serverApp.handle(
        createRequest("POST", `/sessions/${sessionId}/statements`, {
          app: "test",
          statement: "there is a submit button on the page",
          accessibility_tree: sampleAccessibilityTree,
          url: "https://example.com",
          title: "Test Page",
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        explanation:
          "Found the requested information in the accessibility tree",
        result: "true",
      });
    });
  });

  describe("POST /sessions/:session_id/areas", () => {
    it("responds with area", async () => {
      const sessionId = await createSession();
      const response = await serverApp.handle(
        createRequest("POST", `/sessions/${sessionId}/areas`, {
          app: "test",
          description: "find the login form area",
          accessibility_tree: sampleAccessibilityTree,
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        explanation: "Found the TODO list area",
        id: 14,
      });
    });
  });

  describe("POST /sessions/:session_id/elements", () => {
    it("finds element", async () => {
      const sessionId = await createSession();
      const response = await serverApp.handle(
        createRequest("POST", `/sessions/${sessionId}/elements`, {
          app: "test",
          description: "submit button",
          accessibility_tree: sampleAccessibilityTree,
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        elements: [{ id: 16, explanation: "Found the checkbox element" }],
      });
    });
  });

  describe("POST /sessions/:session_id/changes", () => {
    it("analyzes UI changes", async () => {
      const sessionId = await createSession();
      const response = await serverApp.handle(
        createRequest("POST", `/sessions/${sessionId}/changes`, {
          app: "test",
          before: {
            accessibility_tree: sampleAccessibilityTree,
            url: "https://example.com/page",
          },
          after: {
            accessibility_tree: sampleAccessibilityTree,
            url: "https://example.com/page",
          },
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        result:
          "URL did not change. Button text changed from 'Click me' to 'Submit'.",
      });
    });

    it("analyzes UI changes with URL change", async () => {
      const sessionId = await createSession();
      const response = await serverApp.handle(
        createRequest("POST", `/sessions/${sessionId}/changes`, {
          app: "test",
          before: {
            accessibility_tree: sampleAccessibilityTree,
            url: "https://example.com/page1",
          },
          after: {
            accessibility_tree: sampleAccessibilityTree,
            url: "https://example.com/page2",
          },
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        result:
          "URL changed to https://example.com/page2. Button text changed from 'Click me' to 'Submit'.",
      });
    });

    it("analyzes UI changes with empty URL", async () => {
      const sessionId = await createSession();

      const response = await serverApp.handle(
        createRequest("POST", `/sessions/${sessionId}/changes`, {
          app: "test",
          before: {
            accessibility_tree: sampleAccessibilityTree,
            url: "",
          },
          after: {
            accessibility_tree: sampleAccessibilityTree,
            url: "",
          },
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        result: "Button text changed from 'Click me' to 'Submit'.",
      });
    });
  });

  describe("POST /sessions/:session_id/examples", () => {
    it("adds examples", async () => {
      const sessionId = await createSession();
      const response = await serverApp.handle(
        createRequest("POST", `/sessions/${sessionId}/examples`, {
          goal: "login to the app",
          actions: [
            "fill username field",
            "fill password field",
            "click submit",
          ],
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        success: true,
        message: "Example added successfully",
      });
    });
  });

  describe("DELETE /sessions/:session_id/examples", () => {
    it("removes examples", async () => {
      const sessionId = await createSession();
      const response = await serverApp.handle(
        createRequest("DELETE", `/sessions/${sessionId}/examples`),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        success: true,
        message: "All examples cleared successfully",
      });
    });
  });
});

async function createSession() {
  const response = await serverApp.handle(
    createRequest("POST", "/sessions", {
      provider: "anthropic",
      name: "claude-haiku-4-5-20251001",
      platform: "chromium",
      tools: getSampleToolSchemas(),
    }),
  );
  return CreateSessionResponse.parse(await response.json()).session_id;
}

function createRequest(method: Http.Method, path: string, body?: unknown) {
  const init: RequestInit = { method };
  if (typeof body === "object" && body) {
    Object.assign(init, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  return new Request(`http://localhost/v1${path}`, init);
}

function getSampleToolSchemas() {
  return [
    {
      type: "function",
      function: {
        name: "ClickTool",
        description: "Click an element.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer", description: "Element identifier (ID)" },
          },
          required: ["id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "TypeTool",
        description:
          "Type text into an element. Automatically focuses the element and clears it before typing.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer", description: "Element identifier (ID)" },
            text: {
              type: "string",
              description: "Text to type into an element",
            },
          },
          required: ["id", "text"],
        },
      },
    },
  ];
}

var sampleAccessibilityTree = `<RootWebArea raw_id="1" name="Todo app"><textbox raw_id="9" name="New Todo Input" /><group raw_id="14" name="TODO list"><checkbox raw_id="16" name="Buy milk" /></group><button raw_id="20" name="Submit" /></RootWebArea>`;
