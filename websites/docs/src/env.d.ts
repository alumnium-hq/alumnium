/// <reference types="../.astro/types.d.ts" />
/// <reference types="../node_modules/@astrojs/starlight/virtual.d.ts" />
/// <reference types="../node_modules/@astrojs/starlight/virtual-internal.d.ts" />

declare namespace App {
  type StarlightLocals = import("@astrojs/starlight").StarlightLocals;
  interface Locals extends StarlightLocals {}
}

declare module "*.svg" {
  type AstroComponentFactory =
    import("astro/runtime/server/index.js").AstroComponentFactory;
  export default AstroComponentFactory;
}
