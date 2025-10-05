import { BaseTool } from './BaseTool.js';
import { BaseDriver } from '../drivers/BaseDriver.js';

export class TypeTool extends BaseTool {
  static description = 'Type text into an element.';

  id: number;
  text: string;

  constructor(args: { id: number; text: string }) {
    super();
    this.id = args.id;
    this.text = args.text;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.type(this.id, this.text);
  }
}
