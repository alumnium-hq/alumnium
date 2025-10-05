import { BaseTool } from './BaseTool.js';
import { BaseDriver } from '../drivers/BaseDriver.js';

export class SelectTool extends BaseTool {
  static description = 'Selects an option in a dropdown. Only use this tool if the dropdown is a combobox.';

  id: number;
  option: string;

  constructor(args: { id: number; option: string }) {
    super();
    this.id = args.id;
    this.option = args.option;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.select(this.id, this.option);
  }
}
