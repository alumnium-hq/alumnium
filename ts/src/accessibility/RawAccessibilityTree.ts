/**
 * Raw accessibility tree wrapper for client-side usage.
 * All processing is done server-side.
 */
export class RawAccessibilityTree {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public rawData: any;
  public automationType: 'chromium' | 'xcuitest' | 'uiautomator2';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(rawData: any, automationType: 'chromium' | 'xcuitest' | 'uiautomator2') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.rawData = rawData;
    this.automationType = automationType;
  }

  /**
   * Create a new RawAccessibilityTree filtered to only include the subtree at areaId.
   */
  filterToArea(areaId: number): RawAccessibilityTree {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let filteredData: any;

    if (this.automationType === 'chromium') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      filteredData = this._filterChromiumTree(areaId);
    } else if (this.automationType === 'xcuitest' || this.automationType === 'uiautomator2') {
       
      filteredData = this._filterXmlTree(areaId);
    } else {
      // Unknown type, return full tree
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      filteredData = this.rawData;
    }

    return new RawAccessibilityTree(filteredData, this.automationType);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _filterChromiumTree(areaId: number): any {
    // Build a simplified tree first to get IDs assigned
    // We need to simulate what ServerChromiumTree does
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const nodes = this.rawData.nodes;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeLookup: { [key: string]: any } = {};

    for (const node of nodes) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      nodeLookup[node.nodeId] = node;
    }

    // Rebuild the ID assignment to find which nodeId corresponds to areaId
    // Must iterate in the same order as the server does (order of nodes array)
    const idToNodeId: { [key: number]: string } = {};
    let idCounter = 0;

    for (const node of nodes) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const nodeId = node.nodeId;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const parentId = node.parentId;
      if (parentId === undefined || parentId === null || parentId in nodeLookup) {
        idCounter++;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        idToNodeId[idCounter] = nodeId;
      }
    }

    if (!(areaId in idToNodeId)) {
      // Area ID not found, return full tree
      return this.rawData;
    }

    const areaNodeId = idToNodeId[areaId];

    // Collect all node IDs in the subtree
    const subtreeNodeIds = new Set<string>();

    const collectNodeIds = (nodeId: string) => {
      subtreeNodeIds.add(nodeId);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const node = nodeLookup[nodeId];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (node && node.childIds) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        for (const childId of node.childIds) {
           
          if (childId in nodeLookup) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            collectNodeIds(childId);
          }
        }
      }
    };

     
    collectNodeIds(areaNodeId);

    // Filter nodes to only those in the subtree (make copies to avoid modifying original)
    const filteredNodes = [];
    for (const node of nodes) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      if (subtreeNodeIds.has(node.nodeId)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const nodeCopy = JSON.parse(JSON.stringify(node));
        // Remove any previously assigned IDs from temp processing
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        delete nodeCopy.id;
        // Update parent references - make area_node the root
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (nodeCopy.nodeId === areaNodeId) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          delete nodeCopy.parentId;
        }
        filteredNodes.push(nodeCopy);
      }
    }

    return { nodes: filteredNodes };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _filterXmlTree(_areaId: number): string {
    // For XML trees (XCUITest or UIAutomator2), we need to parse and filter
    // This is a simplified implementation - in practice you might want a proper XML parser
    // For now, return the full tree as filtering XML in TypeScript is complex
    // and this is primarily used for Chromium
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.rawData;
  }
}
