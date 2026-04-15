import type { Http } from "../Http.ts";
import { LlmUsageStats } from "../llm/llmSchema.ts";
import { Model } from "../Model.ts";
import { ErrorResponse, HealthCheckResponse } from "../server/serverSchema.ts";
import { Logger } from "../telemetry/Logger.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { Tracer } from "../telemetry/Tracer.ts";
import { convertToolsToSchemas } from "../tools/toolToSchemaConverter.ts";
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
} from "./ApiModels.ts";
import { Client } from "./Client.ts";
import { type Data, looselyTypecast } from "./typecasting.ts";

const logger = Logger.get(import.meta.url);
const { tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

export namespace HttpClient {
  export interface Props extends Client.Props {
    model?: Model | undefined;
    baseUrl: string;
  }
}

export class HttpClient extends Client {
  static TIMEOUT: number = 300_000; // 5 minutes

  #model: Model | undefined;
  #baseUrl: string;
  #sessionIdPromise: Promise<string>;

  constructor(props: HttpClient.Props) {
    const { baseUrl, model, ...superProps } = props;
    super(superProps);

    logger.debug("Initializing HttpClient with props: {props}", { props });
    if (model) {
      logger.info(`Using model: ${model.provider}/${model.name}`);
    } else {
      logger.info("Using model defined by server");
    }

    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#sessionIdPromise = this.#initSession();
  }

  @span("client.get_model", spanAttrs)
  async getModel(): Promise<Model> {
    await this.#sessionIdPromise;
    return this.#model!;
  }

  @span("client.get_health", spanAttrs)
  async getHealth(): Promise<HealthCheckResponse> {
    return this.#fetch<HealthCheckResponse>("GET", "/health");
  }

  @span("client.quit", spanAttrs)
  async quit(): Promise<void> {
    await this.#sessionFetch("DELETE", "/");
  }

  @span("client.plan_actions", spanAttrs)
  async planActions(
    props: Client.PlanActionsProps,
  ): Promise<Client.PlanActionsResult> {
    const { goal, accessibilityTree, app } = props;
    const body: PlanRequest = {
      goal,
      accessibility_tree: accessibilityTree,
      app,
    };
    return this.#sessionFetch<PlanResponse>("POST", "/plans", body);
  }

  @span("client.add_example", spanAttrs)
  async addExample(props: Client.AddExampleProps): Promise<void> {
    const { goal, actions } = props;
    const body: AddExampleRequest = {
      goal,
      actions,
    };
    await this.#sessionFetch("POST", "/examples", body);
  }

  @span("client.clear_examples", spanAttrs)
  async clearExamples(): Promise<void> {
    await this.#sessionFetch("DELETE", "/examples");
  }

  @span("client.execute_action", spanAttrs)
  async executeAction(
    props: Client.ExecuteActionProps,
  ): Promise<Client.ExecuteActionResult> {
    const { goal, step, accessibilityTree, app } = props;
    const body: StepRequest = {
      goal,
      step,
      accessibility_tree: accessibilityTree,
      app,
    };
    return this.#sessionFetch<StepResponse>("POST", "/steps", body);
  }

  @span("client.retrieve", (props) => ({
    "client.kind": "http",
    "client.retrieve.args.has_screenshot": !!props.screenshot,
  }))
  async retrieve(props: Client.RetrieveProps): Promise<[string, Data]> {
    const { statement, accessibilityTree, title, url, app, screenshot } = props;

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
    return [result.explanation, looselyTypecast(result.result)] as [
      string,
      Data,
    ];
  }

  @span("client.find_area", spanAttrs)
  async findArea(props: Client.FindAreaProps): Promise<Client.FindAreaResult> {
    const { description, accessibilityTree, app } = props;
    const body: AreaRequest = {
      description,
      accessibility_tree: accessibilityTree,
      app,
    };
    const data = await this.#sessionFetch<AreaResponse>("POST", "/areas", body);
    return { id: data.id, explanation: data.explanation };
  }

  @span("client.find_element", spanAttrs)
  async findElement(
    props: Client.FindElementProps,
  ): Promise<Client.FindElementResult | undefined> {
    const { description, accessibilityTree, app } = props;
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

  @span("client.analyze_changes", spanAttrs)
  async analyzeChanges(props: Client.AnalyzeChangesProps): Promise<string> {
    const {
      beforeAccessibilityTree,
      beforeUrl,
      afterAccessibilityTree,
      afterUrl,
      app,
    } = props;
    const body: ChangesRequest = {
      before: {
        accessibility_tree: beforeAccessibilityTree,
        url: beforeUrl,
      },
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

  @span("client.save_cache", spanAttrs)
  async saveCache(): Promise<void> {
    await this.#sessionFetch("POST", "/caches");
  }

  @span("client.discard_cache", spanAttrs)
  async discardCache(): Promise<void> {
    await this.#sessionFetch("DELETE", "/caches");
  }

  @span("client.get_stats", spanAttrs)
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
      provider: this.#model?.provider,
      name: this.#model?.name,
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

    this.#model = Model.fromString(result.model);
    const sessionId = result.session_id;
    logger.debug(`Session initialized with ID: ${sessionId}`);
    return sessionId;
  }

  async #fetch<Result>(
    method: Http.Method,
    path: string,
    body?: unknown,
  ): Promise<Result> {
    return tracer.span(
      "http.request",
      { "http.request.method": method },
      async (span) => {
        const init: RequestInit = {
          method,
          signal: AbortSignal.timeout(HttpClient.TIMEOUT),
        };

        logger.debug("Making HTTP request {method} {path} with body: {body}", {
          method,
          path,
          body: Logger.debugExtra("http", body),
        });

        if (body != null) {
          init.headers = { "Content-Type": "application/json" };
          init.body = JSON.stringify(body);

          span.attr("http.request.content_type", "application/json");
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
            logger.warn(
              "Failed to parse error response as JSON: {err}{stack}",
              {
                err,
                stack,
              },
            );
            detail = errorText;
          }
          throw new Error(
            `${init.method || "GET"} ${url} responded with ${response.status} ${response.statusText}: ${detail}`,
          );
        }

        const payload = await response.json();

        logger.debug("Received response for {method} {path}: {payload}", {
          method,
          path,
          payload: Logger.debugExtra("http", payload),
        });

        return payload as Result;
      },
    );
  }
}

function spanAttrs(this: HttpClient): Tracer.SpansClientAttrsBase {
  return {
    "client.kind": "http",
  };
}
