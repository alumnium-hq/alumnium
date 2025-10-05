import axios, { AxiosInstance } from 'axios';
import { BaseTool } from '../tools/BaseTool.js';
import { convertToolsToSchemas } from '../tools/toolToSchemaConverter.js';
import { Model } from '../Model.js';
import { RawAccessibilityTree } from '../accessibility/RawAccessibilityTree.js';
import { AccessibilityElement } from '../accessibility/AccessibilityElement.js';

export type Data = number | string | boolean | number[] | string[] | boolean[];

export class HttpClient {
  private baseUrl: string;
  private sessionId: string | null = null;
  private client: AxiosInstance;
  private sessionPromise: Promise<void> | null = null;
  private idMappings: Record<number, number> = {};

  constructor(baseUrl: string, private tools: Record<string, new (...args: any[]) => BaseTool>) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.client = axios.create({ timeout: 120000 });
  }

  elementById(id: number): AccessibilityElement {
    if (!(id in this.idMappings)) {
      throw new Error(`No element with id=${id}`);
    }
    const backendId = this.idMappings[id];
    return new AccessibilityElement(backendId);
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

  async planActions(goal: string, rawTree: RawAccessibilityTree): Promise<string[]> {
    await this.ensureSession();
    const response = await this.client.post(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/plans`,
      {
        goal,
        raw_data: rawTree.rawData,
        automation_type: rawTree.automationType
      }
    );
    // Store ID mappings if provided
    if (response.data.id_mappings) {
      this.idMappings = {};
      for (const [key, value] of Object.entries(response.data.id_mappings)) {
        this.idMappings[parseInt(key)] = value as number;
      }
    }
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

  async executeAction(goal: string, step: string, rawTree: RawAccessibilityTree): Promise<any[]> {
    await this.ensureSession();
    const response = await this.client.post(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/steps`,
      {
        goal,
        step,
        raw_data: rawTree.rawData,
        automation_type: rawTree.automationType
      }
    );
    // Store ID mappings if provided
    if (response.data.id_mappings) {
      this.idMappings = {};
      for (const [key, value] of Object.entries(response.data.id_mappings)) {
        this.idMappings[parseInt(key)] = value as number;
      }
    }
    return response.data.actions;
  }

  async retrieve(
    statement: string,
    rawTree: RawAccessibilityTree,
    title: string,
    url: string,
    screenshot?: string
  ): Promise<[string, Data]> {
    await this.ensureSession();
    const response = await this.client.post(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/statements`,
      {
        statement,
        raw_data: rawTree.rawData,
        automation_type: rawTree.automationType,
        title,
        url,
        screenshot: screenshot || null,
      }
    );
    // Store ID mappings if provided
    if (response.data.id_mappings) {
      this.idMappings = {};
      for (const [key, value] of Object.entries(response.data.id_mappings)) {
        this.idMappings[parseInt(key)] = value as number;
      }
    }
    return [response.data.explanation, response.data.result];
  }

  async findArea(description: string, rawTree: RawAccessibilityTree): Promise<{ id: number; explanation: string }> {
    await this.ensureSession();
    const response = await this.client.post(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/areas`,
      {
        description,
        raw_data: rawTree.rawData,
        automation_type: rawTree.automationType
      }
    );
    // Store ID mappings if provided
    if (response.data.id_mappings) {
      this.idMappings = {};
      for (const [key, value] of Object.entries(response.data.id_mappings)) {
        this.idMappings[parseInt(key)] = value as number;
      }
    }
    return { id: response.data.id, explanation: response.data.explanation };
  }

  async findElement(description: string, rawTree: RawAccessibilityTree): Promise<any> {
    await this.ensureSession();
    const response = await this.client.post(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/elements`,
      {
        description,
        raw_data: rawTree.rawData,
        automation_type: rawTree.automationType
      }
    );
    // Store ID mappings if provided
    if (response.data.id_mappings) {
      this.idMappings = {};
      for (const [key, value] of Object.entries(response.data.id_mappings)) {
        this.idMappings[parseInt(key)] = value as number;
      }
    }
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
