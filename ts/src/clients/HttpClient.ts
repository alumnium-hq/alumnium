import axios, { AxiosInstance } from 'axios';
import { BaseTool } from '../tools/BaseTool';
import { convertToolsToSchemas } from '../tools/toolToSchemaConverter';
import { Model } from '../Model';

export type Data = number | string | boolean | number[] | string[] | boolean[];

export class HttpClient {
  private baseUrl: string;
  private sessionId: string | null = null;
  private client: AxiosInstance;
  private sessionPromise: Promise<void> | null = null;

  constructor(baseUrl: string, private tools: Record<string, new (...args: any[]) => BaseTool>) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.client = axios.create({ timeout: 120000 });
  }

  private async ensureSession(): Promise<void> {
    if (this.sessionId) {
      return;
    }

    if (!this.sessionPromise) {
      this.sessionPromise = (async () => {
        const toolSchemas = convertToolsToSchemas(this.tools);
        const response = await this.client.post(`${this.baseUrl}/v1/sessions`, {
          provider: Model.current.provider,
          name: Model.current.name,
          tools: toolSchemas,
        });
        this.sessionId = response.data.session_id;
      })();
    }

    await this.sessionPromise;
  }

  async quit(): Promise<void> {
    if (this.sessionId) {
      await this.client.delete(`${this.baseUrl}/v1/sessions/${this.sessionId}`);
      this.sessionId = null;
    }
  }

  async planActions(goal: string, accessibilityTree: string): Promise<string[]> {
    await this.ensureSession();
    const response = await this.client.post(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/plans`,
      { goal, accessibility_tree: accessibilityTree }
    );
    return response.data.steps;
  }

  async addExample(goal: string, actions: string[]): Promise<void> {
    await this.ensureSession();
    await this.client.post(`${this.baseUrl}/v1/sessions/${this.sessionId}/examples`, {
      goal,
      actions,
    });
  }

  async clearExamples(): Promise<void> {
    await this.ensureSession();
    await this.client.delete(`${this.baseUrl}/v1/sessions/${this.sessionId}/examples`);
  }

  async executeAction(goal: string, step: string, accessibilityTree: string): Promise<any[]> {
    await this.ensureSession();
    const response = await this.client.post(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/steps`,
      { goal, step, accessibility_tree: accessibilityTree }
    );
    return response.data.actions;
  }

  async retrieve(
    statement: string,
    accessibilityTree: string,
    title: string,
    url: string,
    screenshot?: string
  ): Promise<[string, Data]> {
    await this.ensureSession();
    const response = await this.client.post(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/statements`,
      {
        statement,
        accessibility_tree: accessibilityTree,
        title,
        url,
        screenshot: screenshot || null,
      }
    );
    return [response.data.explanation, response.data.result];
  }

  async findArea(description: string, accessibilityTree: string): Promise<{ id: number; explanation: string }> {
    await this.ensureSession();
    const response = await this.client.post(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/areas`,
      { description, accessibility_tree: accessibilityTree }
    );
    return { id: response.data.id, explanation: response.data.explanation };
  }

  async findElement(description: string, accessibilityTree: string): Promise<any> {
    await this.ensureSession();
    const response = await this.client.post(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/elements`,
      { description, accessibility_tree: accessibilityTree }
    );
    return response.data.elements[0];
  }

  async saveCache(): Promise<void> {
    await this.ensureSession();
    await this.client.post(`${this.baseUrl}/v1/sessions/${this.sessionId}/caches`);
  }

  async discardCache(): Promise<void> {
    await this.ensureSession();
    await this.client.delete(`${this.baseUrl}/v1/sessions/${this.sessionId}/caches`);
  }

  async getStats(): Promise<Record<string, Record<string, number>>> {
    await this.ensureSession();
    const response = await this.client.get(`${this.baseUrl}/v1/sessions/${this.sessionId}/stats`);
    return response.data;
  }
}
