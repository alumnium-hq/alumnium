import { marked } from "marked";
import { ttLandings } from "./landings";

export const tt = {
  landings: ttLandings,

  async md(string: string, inline?: boolean): Promise<string> {
    if (inline) return marked.parseInline(string);
    return marked.parse(string);
  },
};
