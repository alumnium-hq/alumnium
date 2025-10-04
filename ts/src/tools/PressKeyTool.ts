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

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.pressKey(this.key);
  }
}
