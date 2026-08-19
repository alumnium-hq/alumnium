import { anyLang, langs, type I18n } from "./i18n";

export const discordInviteUrl = "https://discord.gg/mP29tTtKHg";
export const githubRepositoryUrl = "https://github.com/alumnium-hq/alumnium";

export const ttLinks = {
  //#region Internal

  docs: link("/docs", langs({ en: "Documentation" })),

  blog: link("/blog", "Blog"),

  //#endregion

  //#region Social

  github: link(githubRepositoryUrl, "GitHub"),

  slack: link("https://seleniumhq.slack.com/channels/alumnium", "Slack"),

  discord: link(discordInviteUrl, "Discord"),

  ghDiscussions: link(
    "https://github.com/alumnium-hq/alumnium/discussions",
    "GitHub Discussions",
  ),

  //#endregion

  //#region Misc

  mitLicense: link(
    "https://github.com/alumnium-hq/alumnium/blob/main/LICENSE.md",
    "MIT License",
  ),

  //#endregion
};

export namespace TtLinks {
  export interface Link {
    label: I18n.FullLangsMap<string>;
    href: string;
  }
}

function link(
  href: string,
  label: string | I18n.FullLangsMap<string>,
): TtLinks.Link {
  return {
    href,
    label: typeof label === "string" ? anyLang(label) : label,
  };
}
