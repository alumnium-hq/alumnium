import { marked } from "marked";
import { ttLandings } from "./landings";
import { ttHow } from "./how";
import { ttBase } from "./base";
import { ttLayout } from "./layout";
import { ttLinks } from "./links";
import { ttBlog } from "./blog";

export const tt = {
  base: ttBase,

  links: ttLinks,

  layout: ttLayout,

  landings: ttLandings,

  how: ttHow,

  blog: ttBlog,

  async md(string: string, inline?: boolean): Promise<string> {
    if (inline) return marked.parseInline(string);
    return marked.parse(string);
  },
};
