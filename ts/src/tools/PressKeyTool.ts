import { BaseTool } from './BaseTool';
import { BaseDriver } from '../drivers/BaseDriver';
import { Key } from '../drivers/keys';

export class PressKeyTool extends BaseTool {
  static description = 'Press a keyboard key.';

  key: Key;

  constructor(args: { key: Key }) {
    super();
    this.key = args.key;
  }

  invoke(driver: BaseDriver): void {
    driver.pressKey(this.key);
  }
}
