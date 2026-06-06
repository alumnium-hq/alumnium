import { txt } from "smollit";
import { langs, type I18n } from "./i18n";
import { ttLinks, type TtLinks } from "./links";

export const ttLayout = {
  footer: {
    newsletter: langs({
      en: {
        headline: "Let's Stay in Touch",

        copy: txt`
          Share your email to stay up to date with the latest updates from
          Alumnium.
        `,

        email: {
          label: "Email address",
          placeholder: "name@example.com",
        },

        submit: "Subscribe",
      },
    }),

    links: linksGroups([
      {
        heading: langs({ en: "Learn" }),
        links: [ttLinks.docs, ttLinks.blog],
      },
      {
        heading: langs({ en: "Community" }),
        links: [ttLinks.discord, ttLinks.slack, ttLinks.ghDiscussions],
      },
    ]),
  },
};

export namespace TtLayout {
  export interface FooterLinksGroup {
    heading: I18n.FullLangsMap<string>;
    links: TtLinks.Link[];
  }

  export interface FooterLink {
    label: I18n.FullLangsMap<string>;
    href: string;
  }
}

function linksGroups(
  groups: TtLayout.FooterLinksGroup[],
): TtLayout.FooterLinksGroup[] {
  return groups;
}
