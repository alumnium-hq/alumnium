import { txt } from "smollit";
import { langs } from "./i18n";

export const ttBlocks = {
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
};
