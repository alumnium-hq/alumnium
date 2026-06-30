import type { IconProp } from "#/components/Icon.types";
import type { TtCode } from "#/copy/code";
import type { TtDemo } from "#/copy/demo";
import type { I18n } from "#/copy/i18n";
import type { TtLandings } from "#/copy/landings";

export interface SectionHeadingProps {
  h: SectionHeadingHProp;
  t: {
    kicker?: string | undefined;
    headline?: string | undefined;
    subheadline?: string | undefined;
  };
  align?: boolean;
  style?: "enlarge" | "compact";
}

export type SectionHeadingHProp = 1 | 2 | 3 | 4;

export interface SectionContentProps {
  t: SectionHeadingProps["t"] & {
    copy?: string | undefined;
    icon?: IconProp;
  };
  icon?: IconProp | undefined;
  heading: SectionContentHeadingProp;
}

export type SectionContentHeadingProp = Omit<SectionHeadingProps, "t">;

export interface SectionPointsContentProps {
  heading?: SectionContentHeadingProp;
  items: SectionPointsItem[];
  cols?: "flex" | 1 | 2 | 3 | 4;
}

export interface SectionPointsItem {
  icon: string;
  content: I18n.FullLangsMap<TtLandings.Content>;
}

export type SectionExtraProps =
  | SectionExtraIcons
  | SectionExtraDemo
  | SectionExtraCode
  | SectionExtraPoints
  | SectionExtraChecklist
  | SectionExtraCopy;

export interface SectionExtraIcons {
  kind: "icons";
  icons: IconProp[];
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  adjust?: "start" | "center" | boolean | "end";
  align?: "start" | "center" | boolean | "end";
}

export interface SectionExtraDemo {
  kind: "demo";
  id: TtDemo.Id;
}

export interface SectionExtraExample {
  kind: "example";
  id: TtDemo.Id;
}

export interface SectionExtraCode {
  kind: "code";
  id: TtCode.Id;
}

export interface SectionExtraPoints extends SectionPointsContentProps {
  kind: "points";
}

export interface SectionExtraChecklist {
  kind: "checklist";
  items: I18n.FullLangsMap<string>[];
}

export interface SectionExtraCopy {
  kind: "copy";
  content: I18n.FullLangsMap<string>;
}

export interface BaseSectionProps {
  cols?: 1 | 2;
  span?: 1 | 2 | 3 | 4 | 5 | 6;
  content?: SectionExtraProps & {
    heading?: SectionContentHeadingProp;
  };
  extra?: SectionExtraProps;
  style?: SectionStyle;
  align?: boolean;
  continue?: boolean;
  adjust?: boolean;
}

export type SectionStyle = "default" | "header" | "compact" | "tight";

export interface SectionContentfulProps
  extends BaseSectionProps, SectionContentProps {}

export interface BareSectionProps extends BaseSectionProps {}

export type SectionProps = SectionContentfulProps | BareSectionProps;
