import { langs } from "./i18n";

export const ttBase = {
  size: langs({
    en: {
      mb: (value: number) => `${value} MB`,
    },
  }),
};
