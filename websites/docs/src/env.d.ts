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

declare module "asciinema-player" {
  export interface PlayerOptions {
    // See: https://docs.asciinema.org/manual/player/options/
    preload?: boolean;
    theme?: string;
  }

  export type PlayerEventName = "play" | "playing" | "pause" | "ended";

  export interface Player {
    getCurrentTime(): number;
    getDuration(): number | null;
    play(): Promise<void>;
    pause(): void;
    seek(
      location: number | string | { marker: number | "prev" | "next" },
    ): Promise<void>;
    addEventListener(
      eventName: PlayerEventName,
      handler: (this: Player) => void,
    ): void;
    dispose(): void;
  }

  export function create(
    src: string,
    containerElement: HTMLElement,
    opts?: PlayerOptions,
  ): Player;
}
