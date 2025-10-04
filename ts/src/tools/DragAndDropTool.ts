import { BaseTool } from './BaseTool';
import { BaseDriver } from '../drivers/BaseDriver';

export class DragAndDropTool extends BaseTool {
  static description = "Drag one element onto another and drop it. Don't combine with HoverTool.";

  fromId: number;
  toId: number;

  constructor(args: { from_id: number; to_id: number }) {
    super();
    this.fromId = args.from_id;
    this.toId = args.to_id;
  }

  invoke(driver: BaseDriver): void {
    driver.dragAndDrop(this.fromId, this.toId);
  }
}
