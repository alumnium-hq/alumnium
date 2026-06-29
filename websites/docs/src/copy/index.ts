import { marked } from "marked";
import { ttLandings } from "./landings";
import { ttCode } from "./code";
import { ttBase } from "./base";
import { ttLayout } from "./layout";
import { ttLinks } from "./links";
import { ttBlog } from "./blog";
import { ttDemo } from "./demo";

export const tt = {
  base: ttBase,

  links: ttLinks,

  demo: ttDemo,

  layout: ttLayout,

  landings: ttLandings,

  code: ttCode,

  blog: ttBlog,

  async md(string: string, inline?: boolean): Promise<string> {
    if (inline) return marked.parseInline(string);
    return marked.parse(string);
  },
};
