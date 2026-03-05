import { ErrorResponse, UsageStats } from "../server/serverSchema.js";
import { convertToolsToSchemas } from "../tools/toolToSchemaConverter.js";
import { getLogger } from "../utils/logger.js";
import {
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
import { Data, looselyTypecast } from "./typecasting.js";

const logger = getLogger(import.meta.url);

export namespace HttpClient {
  export interface Props extends Client.Props {
    baseUrl: string;
  }
}

export class HttpClient extends Client {
  private baseUrl: string;
  private sessionId: string | null = null;
  private sessionPromise: Promise<void> | null = null;
  private timeout: number = 300_000; // 5 minutes

  constructor(props: HttpClient.Props) {
    const { baseUrl, ...superProps } = props;
    super(superProps);
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(this.timeout),
    });

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
        `${options.method || "GET"} ${url} responded with ${response.status} ${response.statusText}: ${detail}`,
      );
    }

    return response;
  }

  private async ensureSession(): Promise<void> {
    if (this.sessionId) {
      return;
    }

    if (!this.sessionPromise) {
      this.sessionPromise = (async () => {
        const toolSchemas = convertToolsToSchemas(this.tools);
        const requestBody: SessionRequest = {
          provider: this.model.provider,
          name: this.model.name,
          platform: this.platform as SessionRequest["platform"],
          tools: toolSchemas,
          planner: this.planner,
          exclude_attributes: this.excludeAttributes,
        };
        const response = await this.fetchWithTimeout(
          `${this.baseUrl}/v1/sessions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          },
        );

        const data = (await response.json()) as SessionResponse;
        this.sessionId = data.session_id;
        logger.debug(`Session initialized with ID: ${this.sessionId}`);
      })();
    }

    await this.sessionPromise;
  }

  async quit(): Promise<void> {
    if (this.sessionId) {
      await this.fetchWithTimeout(
        `${this.baseUrl}/v1/sessions/${this.sessionId}`,
        {
          method: "DELETE",
        },
      );
      this.sessionId = null;
    }
  }

  async planActions(
    goal: string,
    accessibilityTree: string,
    app: string = "unknown",
  ): Promise<Client.PlanActionsResult> {
    await this.ensureSession();
    const requestBody: PlanRequest = {
      goal,
      accessibility_tree: accessibilityTree,
      app,
    };
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/plans`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    const responseData = (await response.json()) as PlanResponse;
    return { explanation: responseData.explanation, steps: responseData.steps };
  }

  async addExample(goal: string, actions: string[]): Promise<void> {
    await this.ensureSession();
    const requestBody: AddExampleRequest = {
      goal,
      actions,
    };
    await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/examples`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );
  }

  async clearExamples(): Promise<void> {
    await this.ensureSession();
    await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/examples`,
      {
        method: "DELETE",
      },
    );
  }

  async executeAction(
    goal: string,
    step: string,
    accessibilityTree: string,
    app: string = "unknown",
  ): Promise<Client.ExecuteActionResult> {
    await this.ensureSession();
    const requestBody: StepRequest = {
      goal,
      step,
      accessibility_tree: accessibilityTree,
      app,
    };
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/steps`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    return (await response.json()) as StepResponse;
  }

  async retrieve(
    statement: string,
    accessibilityTree: string,
    title: string,
    url: string,
    screenshot?: string,
    app: string = "unknown",
  ): Promise<[string, Data]> {
    await this.ensureSession();
    const requestBody: StatementRequest = {
      statement,
      accessibility_tree: accessibilityTree,
      title,
      url,
      screenshot: screenshot || null,
      app,
    };
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/statements`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    const responseData = (await response.json()) as StatementResponse;
    return [responseData.explanation, looselyTypecast(responseData.result)];
  }

  async findArea(
    description: string,
    accessibilityTree: string,
    app: string = "unknown",
  ): Promise<Client.FindAreaResult> {
    await this.ensureSession();
    const requestBody: AreaRequest = {
      description,
      accessibility_tree: accessibilityTree,
      app,
    };
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/areas`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    const responseData = (await response.json()) as AreaResponse;
    return { id: responseData.id, explanation: responseData.explanation };
  }

  async findElement(
    description: string,
    accessibilityTree: string,
    app: string = "unknown",
  ): Promise<Client.FindElementResult | undefined> {
    await this.ensureSession();
    const requestBody: FindRequest = {
      description,
      accessibility_tree: accessibilityTree,
      app,
    };
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/elements`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    const responseData = (await response.json()) as FindResponse;
    return responseData.elements[0];
  }

  async analyzeChanges(
    beforeAccessibilityTree: string,
    beforeUrl: string,
    afterAccessibilityTree: string,
    afterUrl: string,
  ): Promise<string> {
    await this.ensureSession();
    const requestBody: ChangesRequest = {
      before: { accessibility_tree: beforeAccessibilityTree, url: beforeUrl },
      after: { accessibility_tree: afterAccessibilityTree, url: afterUrl },
    };
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/changes`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    const responseData = (await response.json()) as ChangesResponse;
    return responseData.result;
  }

  async saveCache(): Promise<void> {
    await this.ensureSession();
    await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/caches`,
      {
        method: "POST",
      },
    );
  }

  async discardCache(): Promise<void> {
    await this.ensureSession();
    await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/caches`,
      {
        method: "DELETE",
      },
    );
  }

  async getStats(): Promise<UsageStats> {
    await this.ensureSession();
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/stats`,
      {
        method: "GET",
      },
    );
    return (await response.json()) as UsageStats;
  }
}
