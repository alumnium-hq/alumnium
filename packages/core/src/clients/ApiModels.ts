/**
 * TypeScript interfaces for API request and response models.
 *
 * IMPORTANT: These interfaces must be kept in sync with the Python API models
 * defined in packages/python/src/alumnium/server/api_models.py
 */

import type { ElementRef } from "../server/serverSchema.js";
import type { ToolCall } from "../tools/BaseTool.js";

export interface SessionRequest {
  platform: "chromium" | "uiautomator2" | "xcuitest";
  provider: string;
  name?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: { [key: string]: any }[];
  planner: boolean;
  excluded_attributes?: string[];
}

export interface SessionResponse {
  session_id: string;
}

export interface PlanRequest {
  goal: string;
  accessibility_tree: string;
  url?: string;
  title?: string;
  app?: string;
}

export interface PlanResponse {
  explanation: string;
  steps: string[];
}

export interface StepRequest {
  goal: string;
  step: string;
  accessibility_tree: string;
  app?: string;
}

export interface StepResponse {
  explanation: string;
  actions: ToolCall[];
}

export interface StatementRequest {
  statement: string;
  accessibility_tree: string;
  url?: string;
  title?: string;
  screenshot?: string | null;
  app?: string;
}

export interface StatementResponse {
  result: string | string[];
  explanation: string;
}

export interface AreaRequest {
  description: string;
  accessibility_tree: string;
  app?: string;
}

export interface AreaResponse {
  id: number;
  explanation: string;
}

export interface FindRequest {
  description: string;
  accessibility_tree: string;
  app?: string;
}

export interface FindResponse {
  elements: ElementRef[];
}

export interface AddExampleRequest {
  goal: string;
  actions: string[];
}

export interface ChangeState {
  accessibility_tree: string;
  url: string;
}

export interface ChangesRequest {
  before: ChangeState;
  after: ChangeState;
}

export interface ChangesResponse {
  result: string;
}

export interface StatsResponse {
  [key: string]: {
    [key: string]: number;
  };
}
