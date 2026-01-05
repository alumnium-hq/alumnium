export interface DoStep {
  name: string;
  tools: string[];
}

export interface DoResult {
  explanation: string;
  steps: DoStep[];
}
