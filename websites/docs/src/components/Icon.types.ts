import type { AstroComponentFactory as Comp } from "astro/runtime/server/index.js";

export type IconProps = IconPropsDirect | IconPropsProp;

export type IconPropsDirect<Extra = {}> = (IconPropsId | IconPropsComponent) &
  Extra;

export type IconProp<Extra = {}> = string | Comp | IconPropsDirect<Extra>;

export interface IconPropsProp {
  prop: IconProp;
}

export interface IconPropsComponent extends IconPropsBase {
  Factory: Comp;
}

export interface IconPropsId extends IconPropsBase {
  id: string;
}

export interface IconPropsBase {
  class?: string;
  style?: IconStyle;
}

export type IconStyle = "100" | "200" | "300" | "brands" | "dev" | "logo";
