/**
 * TypeScript interfaces for API request and response models.
 *
 * IMPORTANT: These interfaces must be kept in sync with the Python API models
 * defined in packages/python/src/alumnium/server/api_models.py
 */

export interface SessionRequest {
  platform: "chromium" | "uiautomator2" | "xcuitest";
  provider: string;
  name?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: { [key: string]: any }[];
  planner?: boolean;
}

export interface SessionResponse {
  session_id: string;
}

export interface PlanRequest {
  goal: string;
  accessibility_tree: string;
  url?: string;
  title?: string;
}

export interface PlanResponse {
  explanation: string;
  steps: string[];
}

export interface StepRequest {
  goal: string;
  step: string;
  accessibility_tree: string;
}

export interface StepResponse {
  explanation: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions: { [key: string]: any }[];
}

export interface StatementRequest {
  statement: string;
  accessibility_tree: string;
  url?: string;
  title?: string;
  screenshot?: string | null;
}

export interface StatementResponse {
  result: string | string[];
  explanation: string;
}

export interface AreaRequest {
  description: string;
  accessibility_tree: string;
}

export interface AreaResponse {
  id: number;
  explanation: string;
}

export interface FindRequest {
  description: string;
  accessibility_tree: string;
}

export interface FindResponse {
  elements: { [key: string]: number | string }[];
}

export interface AddExampleRequest {
  goal: string;
  actions: string[];
}

export interface StatsResponse {
  [key: string]: {
    [key: string]: number;
  };
}
