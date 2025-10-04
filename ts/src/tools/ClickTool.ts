import { BaseTool } from './BaseTool';
import { BaseDriver } from '../drivers/BaseDriver';

export class ClickTool extends BaseTool {
  static description = 'Click an element.';

  id: number;

  constructor(args: { id: number }) {
    super();
    this.id = args.id;
  }

  invoke(driver: BaseDriver): void {
    driver.click(this.id);
  }
}
