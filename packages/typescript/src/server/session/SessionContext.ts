import { AppId } from "../../AppId.ts";
import { getLogger } from "../../utils/logger.ts";
import { SessionId } from "./SessionId.ts";

const logger = getLogger(import.meta.url);

export namespace SessionContext {
  export interface Props {
    app?: AppId | undefined;
    sessionId: SessionId;
  }

  export interface Values {
    readonly app: AppId;
  }

  export type UpdateProps = {
    [Key in keyof Values]?: Values[Key] | undefined;
  };
}

export class SessionContext implements SessionContext.Values {
  #app: AppId;
  #sessionId: SessionId;

  constructor(props: SessionContext.Props) {
    this.#app = AppId.parse(props.app);
    this.#sessionId = props.sessionId;
  }

  get app(): AppId {
    return this.#app;
  }

  update(props: SessionContext.UpdateProps): void {
    if (props.app && props.app !== this.#app) {
      logger.debug(
        `Updated session ${this.#sessionId} context app ${this.#app} -> ${props.app}`,
      );
      this.#app = props.app;
    }
  }
}
