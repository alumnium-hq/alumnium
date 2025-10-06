/**
 * Raw accessibility tree wrapper for client-side usage.
 * All processing is done server-side.
 */
export class RawAccessibilityTree {
  public rawData: any;
  public automationType: 'chromium' | 'xcuitest' | 'uiautomator2';

  constructor(rawData: any, automationType: 'chromium' | 'xcuitest' | 'uiautomator2') {
    this.rawData = rawData;
    this.automationType = automationType;
  }

  /**
   * Create a new RawAccessibilityTree filtered to only include the subtree at areaId.
   */
  filterToArea(areaId: number): RawAccessibilityTree {
    let filteredData: any;

    if (this.automationType === 'chromium') {
      filteredData = this._filterChromiumTree(areaId);
    } else if (this.automationType === 'xcuitest' || this.automationType === 'uiautomator2') {
      filteredData = this._filterXmlTree(areaId);
    } else {
      // Unknown type, return full tree
      filteredData = this.rawData;
    }

    return new RawAccessibilityTree(filteredData, this.automationType);
  }

  private _filterChromiumTree(areaId: number): any {
    // Make a deep copy to avoid modifying the original data
    const rawDataCopy = JSON.parse(JSON.stringify(this.rawData));

    // Build a simplified tree first to get IDs assigned
    // We need to simulate what ServerChromiumTree does
    const nodes = this.rawData.nodes;
    const nodeLookup: { [key: string]: any } = {};

    for (const node of nodes) {
      nodeLookup[node.nodeId] = node;
    }

    // Rebuild the ID assignment to find which nodeId corresponds to areaId
    // Must iterate in the same order as the server does (order of nodes array)
    const idToNodeId: { [key: number]: string } = {};
    let idCounter = 0;

    for (const node of nodes) {
      const nodeId = node.nodeId;
      const parentId = node.parentId;
      if (parentId === undefined || parentId === null || parentId in nodeLookup) {
        idCounter++;
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
      const node = nodeLookup[nodeId];
      if (node && node.childIds) {
        for (const childId of node.childIds) {
          if (childId in nodeLookup) {
            collectNodeIds(childId);
          }
        }
      }
    };

    collectNodeIds(areaNodeId);

    // Filter nodes to only those in the subtree (make copies to avoid modifying original)
    const filteredNodes = [];
    for (const node of nodes) {
      if (subtreeNodeIds.has(node.nodeId)) {
        const nodeCopy = JSON.parse(JSON.stringify(node));
        // Remove any previously assigned IDs from temp processing
        delete nodeCopy.id;
        // Update parent references - make area_node the root
        if (nodeCopy.nodeId === areaNodeId) {
          delete nodeCopy.parentId;
        }
        filteredNodes.push(nodeCopy);
      }
    }

    return { nodes: filteredNodes };
  }

  private _filterXmlTree(areaId: number): string {
    // For XML trees (XCUITest or UIAutomator2), we need to parse and filter
    // This is a simplified implementation - in practice you might want a proper XML parser
    // For now, return the full tree as filtering XML in TypeScript is complex
    // and this is primarily used for Chromium
    return this.rawData;
  }
}
