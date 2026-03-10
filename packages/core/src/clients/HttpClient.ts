import { AppId } from "../AppId.js";
import type { Http } from "../Http.js";
import { LlmUsageStats } from "../llm/llmSchema.js";
import { ErrorResponse } from "../server/serverSchema.js";
import { convertToolsToSchemas } from "../tools/toolToSchemaConverter.js";
import { getLogger } from "../utils/logger.js";
import type {
  AddExampleRequest,
  AreaRequest,
  AreaResponse,
  ChangesRequest,
  ChangesResponse,
  FindRequest,
  FindResponse,
  PlanRequest,
  PlanResponse,
  SessionRequest,
  SessionResponse,
  StatementRequest,
  StatementResponse,
  StepRequest,
  StepResponse,
} from "./ApiModels.js";
import { Client } from "./Client.js";
import { type Data, looselyTypecast } from "./typecasting.js";

const logger = getLogger(import.meta.url);

export namespace HttpClient {
  export interface Props extends Client.Props {
    baseUrl: string;
  }
}

export class HttpClient extends Client {
  static TIMEOUT: number = 300_000; // 5 minutes

  #baseUrl: string;
  #sessionIdPromise: Promise<string>;

  constructor(props: HttpClient.Props) {
    const { baseUrl, ...superProps } = props;
    super(superProps);
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#sessionIdPromise = this.#initSession();
  }

  async quit(): Promise<void> {
    await this.#sessionFetch("DELETE", "/sessions");
  }

  async planActions(
    goal: string,
    accessibilityTree: string,
    app: AppId,
  ): Promise<Client.PlanActionsResult> {
    const body: PlanRequest = {
      goal,
      accessibility_tree: accessibilityTree,
      app,
    };
    return this.#sessionFetch<PlanResponse>("POST", "/plans", body);
  }

  async addExample(goal: string, actions: string[]): Promise<void> {
    const body: AddExampleRequest = {
      goal,
      actions,
    };
    await this.#sessionFetch("POST", "/examples", body);
  }

  async clearExamples(): Promise<void> {
    await this.#sessionFetch("DELETE", "/examples");
  }

  async executeAction(
    goal: string,
    step: string,
    accessibilityTree: string,
    app: AppId,
  ): Promise<Client.ExecuteActionResult> {
    const body: StepRequest = {
      goal,
      step,
      accessibility_tree: accessibilityTree,
      app,
    };
    return this.#sessionFetch<StepResponse>("POST", "/steps", body);
  }

  async retrieve(
    statement: string,
    accessibilityTree: string,
    title: string,
    url: string,
    app: AppId,
    screenshot?: string,
  ): Promise<[string, Data]> {
    const body: StatementRequest = {
      statement,
      accessibility_tree: accessibilityTree,
      title,
      url,
      screenshot: screenshot || null,
      app,
    };
    const result = await this.#sessionFetch<StatementResponse>(
      "POST",
      "/statements",
      body,
    );
    return [result.explanation, looselyTypecast(result.result)];
  }

  async findArea(
    description: string,
    accessibilityTree: string,
    app: AppId,
  ): Promise<Client.FindAreaResult> {
    const body: AreaRequest = {
      description,
      accessibility_tree: accessibilityTree,
      app,
    };
    const data = await this.#sessionFetch<AreaResponse>("POST", "/areas", body);
    return { id: data.id, explanation: data.explanation };
  }

  async findElement(
    description: string,
    accessibilityTree: string,
    app: AppId,
  ): Promise<Client.FindElementResult | undefined> {
    const body: FindRequest = {
      description,
      accessibility_tree: accessibilityTree,
      app,
    };
    const result = await this.#sessionFetch<FindResponse>(
      "POST",
      "/elements",
      body,
    );
    return result.elements[0];
  }

  async analyzeChanges(
    beforeAccessibilityTree: string,
    beforeUrl: string,
    afterAccessibilityTree: string,
    afterUrl: string,
    app: AppId,
  ): Promise<string> {
    const body: ChangesRequest = {
      before: { accessibility_tree: beforeAccessibilityTree, url: beforeUrl },
      after: { accessibility_tree: afterAccessibilityTree, url: afterUrl },
      app,
    };
    const result = await this.#sessionFetch<ChangesResponse>(
      "POST",
      "/changes",
      body,
    );
    return result.result;
  }

  async saveCache(): Promise<void> {
    await this.#sessionFetch("POST", "/caches");
  }

  async discardCache(): Promise<void> {
    await this.#sessionFetch("DELETE", "/caches");
  }

  async getStats(): Promise<LlmUsageStats> {
    return this.#sessionFetch<LlmUsageStats>("GET", "/stats");
  }

  async #sessionFetch<Result>(
    method: Http.Method,
    path: string,
    body?: unknown,
  ): Promise<Result> {
    return this.#withSessionId((sessionId) =>
      this.#fetch(method, `/sessions/${sessionId}${path}`, body),
    );
  }

  async #withSessionId<Result>(
    fn: (sessionId: string) => Result | Promise<Result>,
  ): Promise<Result> {
    const sessionId = await this.#sessionIdPromise;
    return fn(sessionId);
  }

  async #initSession(): Promise<string> {
    const toolSchemas = convertToolsToSchemas(this.tools);
    const body: SessionRequest = {
      provider: this.model.provider,
      name: this.model.name,
      platform: this.platform as SessionRequest["platform"],
      tools: toolSchemas,
      planner: this.planner,
      exclude_attributes: this.excludeAttributes,
    };

    const result = await this.#fetch<SessionResponse>(
      "POST",
      "/sessions",
      body,
    );

    const sessionId = result.session_id;
    logger.debug(`Session initialized with ID: ${sessionId}`);
    return sessionId;
  }

  async #fetch<Result>(
    method: Http.Method,
    path: string,
    body?: unknown,
  ): Promise<Result> {
    const init: RequestInit = {
      method,
      signal: AbortSignal.timeout(HttpClient.TIMEOUT),
    };
    if (body != null) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }

    const url = `${this.#baseUrl}/v1${path}`;

    const response = await fetch(url, init);

    if (!response.ok) {
      const errorText = await response.text();
      let detail = "";
      let stack = "";

      try {
        const errorData = ErrorResponse.parse(JSON.parse(errorText));
        detail = errorData.message;
        stack = `\n${errorData.stack}`;
      } catch (err) {
        logger.warn("Failed to parse error response as JSON: {err}{stack}", {
          err,
          stack,
        });
        detail = errorText;
      }
      throw new Error(
        `${init.method || "GET"} ${url} responded with ${response.status} ${response.statusText}: ${detail}`,
      );
    }

    return (await response.json()) as Result;
  }
}
