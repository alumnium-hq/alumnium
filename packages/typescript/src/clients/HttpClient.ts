/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Model } from "../Model.js";
import { BaseTool } from "../tools/BaseTool.js";
import { convertToolsToSchemas } from "../tools/toolToSchemaConverter.js";
import { getLogger } from "../utils/logger.js";
import { Data, looselyTypecast } from "./typecasting.js";

const logger = getLogger(["HttpClient"]);

export class HttpClient {
  private baseUrl: string;
  private sessionId: string | null = null;
  private sessionPromise: Promise<void> | null = null;
  private timeout: number = 300_000; // 5 minutes

  constructor(
    baseUrl: string,
    private platform: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private tools: Record<string, new (...args: any[]) => BaseTool>
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.sessionId) {
      return;
    }

    if (!this.sessionPromise) {
      this.sessionPromise = (async () => {
        const toolSchemas = convertToolsToSchemas(this.tools);
        const response = await this.fetchWithTimeout(
          `${this.baseUrl}/v1/sessions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              provider: Model.current.provider,
              name: Model.current.name,
              platform: this.platform,
              tools: toolSchemas,
            }),
          }
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await response.json();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
  ): Promise<string[]> {
    await this.ensureSession();
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/plans`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          goal,
          accessibility_tree: accessibilityTree,
        }),
      }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseData: any = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return responseData.steps;
  }

  async addExample(goal: string, actions: string[]): Promise<void> {
    await this.ensureSession();
    await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/examples`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          goal,
          actions,
        }),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    await this.ensureSession();
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/steps`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          goal,
          step,
          accessibility_tree: accessibilityTree,
        }),
      }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseData: any = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return responseData.actions;
  }

  async retrieve(
    statement: string,
    accessibilityTree: string,
    title: string,
    url: string,
    screenshot?: string
  ): Promise<[string, Data]> {
    await this.ensureSession();
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/statements`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          statement,
          accessibility_tree: accessibilityTree,
          title,
          url,
          screenshot: screenshot || null,
        }),
      }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseData: any = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
    return [responseData.explanation, looselyTypecast(responseData.result)];
  }

  async findArea(
    description: string,
    accessibilityTree: string
  ): Promise<{ id: number; explanation: string }> {
    await this.ensureSession();
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/areas`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description,
          accessibility_tree: accessibilityTree,
        }),
      }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseData: any = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return { id: responseData.id, explanation: responseData.explanation };
  }

  async findElement(
    description: string,
    accessibilityTree: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    await this.ensureSession();
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/elements`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description,
          accessibility_tree: accessibilityTree,
        }),
      }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseData: any = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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

  async getStats(): Promise<Record<string, Record<string, number>>> {
    await this.ensureSession();
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/stats`,
      {
        method: "GET",
      }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return response.json() as any;
  }
}
