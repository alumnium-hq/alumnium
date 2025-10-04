import axios, { AxiosInstance } from 'axios';
import { BaseTool } from '../tools/BaseTool';
import { convertToolsToSchemas } from '../tools/toolToSchemaConverter';

export type Data = number | string | boolean | number[] | string[] | boolean[];

export class HttpClient {
  private baseUrl: string;
  private session_id: string | null = null;
  private client: AxiosInstance;

  private constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.client = axios.create({ timeout: 120000 });
  }

  static async create(
    baseUrl: string,
    provider: string,
    modelName: string,
    tools: Record<string, new (...args: any[]) => BaseTool>
  ): Promise<HttpClient> {
    const client = new HttpClient(baseUrl);

    // Convert tools to schemas for API
    const toolSchemas = convertToolsToSchemas(tools);

    // Create session on server
    const response = await client.client.post(`${client.baseUrl}/v1/sessions`, {
      provider,
      name: modelName,
      tools: toolSchemas,
    });

    client.session_id = response.data.session_id;
    return client;
  }

  async quit(): Promise<void> {
    if (this.session_id) {
      await this.client.delete(`${this.baseUrl}/v1/sessions/${this.session_id}`);
      this.session_id = null;
    }
  }

  async planActions(goal: string, accessibilityTree: string): Promise<string[]> {
    const response = await this.client.post(
      `${this.baseUrl}/v1/sessions/${this.session_id}/plans`,
      { goal, accessibility_tree: accessibilityTree }
    );
    return response.data.steps;
  }

  async addExample(goal: string, actions: string[]): Promise<void> {
    await this.client.post(`${this.baseUrl}/v1/sessions/${this.session_id}/examples`, {
      goal,
      actions,
    });
  }

  async clearExamples(): Promise<void> {
    await this.client.delete(`${this.baseUrl}/v1/sessions/${this.session_id}/examples`);
  }

  async executeAction(goal: string, step: string, accessibilityTree: string): Promise<any[]> {
    const response = await this.client.post(
      `${this.baseUrl}/v1/sessions/${this.session_id}/steps`,
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
    const response = await this.client.post(
      `${this.baseUrl}/v1/sessions/${this.session_id}/statements`,
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
    const response = await this.client.post(
      `${this.baseUrl}/v1/sessions/${this.session_id}/areas`,
      { description, accessibility_tree: accessibilityTree }
    );
    return { id: response.data.id, explanation: response.data.explanation };
  }

  async findElement(description: string, accessibilityTree: string): Promise<any> {
    const response = await this.client.post(
      `${this.baseUrl}/v1/sessions/${this.session_id}/elements`,
      { description, accessibility_tree: accessibilityTree }
    );
    return response.data.elements[0];
  }

  async saveCache(): Promise<void> {
    await this.client.post(`${this.baseUrl}/v1/sessions/${this.session_id}/caches`);
  }

  async discardCache(): Promise<void> {
    await this.client.delete(`${this.baseUrl}/v1/sessions/${this.session_id}/caches`);
  }

  async getStats(): Promise<Record<string, Record<string, number>>> {
    const response = await this.client.get(`${this.baseUrl}/v1/sessions/${this.session_id}/stats`);
    return response.data;
  }
}
