import { xxh32Str } from "smolxxh/str";

export default {
  multipass: true,
  plugins: [
    "preset-default",
    {
      name: "prefixIds",
      params: {
        delim: "-",
        prefix: (_, file) => {
          const pathHash = xxh32Str(file.path);
          return `id-${pathHash.slice(0, 6)}`;
        },
        prefixClassNames: true,
      },
    },
    "convertStyleToAttrs",
  ],
};
