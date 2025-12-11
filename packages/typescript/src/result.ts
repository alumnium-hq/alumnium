import { Data } from "./clients/typecasting.js";

export interface DoStep {
  name: string;
  tools: string[];
}

export interface DoResult {
  explanation: string;
  steps: DoStep[];
}

export interface GetResult {
  explanation: string;
  data: Data;
}
