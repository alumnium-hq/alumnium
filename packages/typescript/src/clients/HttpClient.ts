import { Model } from "../Model.js";
import { ToolClass } from "../tools/BaseTool.js";
import { convertToolsToSchemas } from "../tools/toolToSchemaConverter.js";
import { getLogger } from "../utils/logger.js";
import {
  AddExampleRequest,
  AreaRequest,
  AreaResponse,
  FindRequest,
  FindResponse,
  PlanRequest,
  PlanResponse,
  SessionRequest,
  SessionResponse,
  StatementRequest,
  StatementResponse,
  StatsResponse,
  StepRequest,
  StepResponse,
} from "./ApiModels.js";
import { Data, looselyTypecast } from "./typecasting.js";

const logger = getLogger(["HttpClient"]);

export class HttpClient {
  private baseUrl: string;
  private sessionId: string | null = null;
  private sessionPromise: Promise<void> | null = null;
  private timeout: number = 300_000; // 5 minutes

  constructor(
    baseUrl: string,
    private model: Model,
    private platform: string,
    private tools: Record<string, ToolClass>,
    private planner: boolean = true
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
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
        };
        const response = await this.fetchWithTimeout(
          `${this.baseUrl}/v1/sessions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }
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
        }
      );
      this.sessionId = null;
    }
  }

  async planActions(
    goal: string,
    accessibilityTree: string
  ): Promise<{ explanation: string; steps: string[] }> {
    await this.ensureSession();
    const requestBody: PlanRequest = {
      goal,
      accessibility_tree: accessibilityTree,
    };
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/plans`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
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
      }
    );
  }

  async clearExamples(): Promise<void> {
    await this.ensureSession();
    await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/examples`,
      {
        method: "DELETE",
      }
    );
  }

  async executeAction(
    goal: string,
    step: string,
    accessibilityTree: string
  ): Promise<{ explanation: string; actions: StepResponse["actions"] }> {
    await this.ensureSession();
    const requestBody: StepRequest = {
      goal,
      step,
      accessibility_tree: accessibilityTree,
    };
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/steps`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    const responseData = (await response.json()) as StepResponse;
    return {
      explanation: responseData.explanation,
      actions: responseData.actions,
    };
  }

  async retrieve(
    statement: string,
    accessibilityTree: string,
    title: string,
    url: string,
    screenshot?: string
  ): Promise<[string, Data]> {
    await this.ensureSession();
    const requestBody: StatementRequest = {
      statement,
      accessibility_tree: accessibilityTree,
      title,
      url,
      screenshot: screenshot || null,
    };
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/statements`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    const responseData = (await response.json()) as StatementResponse;
    return [responseData.explanation, looselyTypecast(responseData.result)];
  }

  async findArea(
    description: string,
    accessibilityTree: string
  ): Promise<{ id: number; explanation: string }> {
    await this.ensureSession();
    const requestBody: AreaRequest = {
      description,
      accessibility_tree: accessibilityTree,
    };
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/areas`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    const responseData = (await response.json()) as AreaResponse;
    return { id: responseData.id, explanation: responseData.explanation };
  }

  async findElement(
    description: string,
    accessibilityTree: string
  ): Promise<FindResponse["elements"][0]> {
    await this.ensureSession();
    const requestBody: FindRequest = {
      description,
      accessibility_tree: accessibilityTree,
    };
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/elements`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    const responseData = (await response.json()) as FindResponse;
    return responseData.elements[0];
  }

  async saveCache(): Promise<void> {
    await this.ensureSession();
    await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/caches`,
      {
        method: "POST",
      }
    );
  }

  async discardCache(): Promise<void> {
    await this.ensureSession();
    await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/caches`,
      {
        method: "DELETE",
      }
    );
  }

  async getStats(): Promise<StatsResponse> {
    await this.ensureSession();
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/stats`,
      {
        method: "GET",
      }
    );
    return (await response.json()) as StatsResponse;
  }
}
