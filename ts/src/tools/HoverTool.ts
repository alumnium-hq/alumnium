import { BaseTool } from './BaseTool';
import { BaseDriver } from '../drivers/BaseDriver';

export class HoverTool extends BaseTool {
  static description = 'Hover over an element.';

  id: number;

  constructor(args: { id: number }) {
    super();
    this.id = args.id;
  }

  invoke(driver: BaseDriver): void {
    driver.hover(this.id);
  }
}
