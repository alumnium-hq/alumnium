export interface ChromiumAXNodeMetadataTarget {
  backendDOMNodeId?: number;
  _mutable?: boolean;
}

export interface ChromiumDOMNodeMetadata {
  nodeId: number;
  backendNodeId: number;
  parentId?: number;
  nodeType: number;
  pseudoType?: string;
  shadowRootType?: string;
  shadowRoots?: ChromiumDOMNodeMetadata[];
}

export function enrichChromiumAXNodes<
  Node extends ChromiumAXNodeMetadataTarget,
>(axNodes: Node[], domNodes: ChromiumDOMNodeMetadata[]): Node[] {
  const domNodesByBackendId: Partial<Record<number, ChromiumDOMNodeMetadata>> =
    {};
  const domNodesByNodeId: Partial<Record<number, ChromiumDOMNodeMetadata>> = {};

  for (const node of domNodes) indexDOMNode(node);

  for (const axNode of axNodes) {
    axNode._mutable = false;
    const backendNodeId = axNode.backendDOMNodeId;
    if (backendNodeId === undefined) continue;

    const domNode = domNodesByBackendId[backendNodeId];
    if (
      domNode?.nodeType === 1 &&
      domNode.pseudoType === undefined &&
      !isWithinUserAgentShadowRoot(domNode)
    ) {
      axNode._mutable = true;
    }
  }

  return axNodes;

  function indexDOMNode(node: ChromiumDOMNodeMetadata): void {
    domNodesByBackendId[node.backendNodeId] = node;
    domNodesByNodeId[node.nodeId] = node;
    for (const shadowRoot of node.shadowRoots ?? []) indexDOMNode(shadowRoot);
  }

  function isWithinUserAgentShadowRoot(node: ChromiumDOMNodeMetadata): boolean {
    let current: ChromiumDOMNodeMetadata | undefined = node;
    const visited = new Set<number>();
    while (current && !visited.has(current.nodeId)) {
      if (current.shadowRootType === "user-agent") return true;
      visited.add(current.nodeId);
      current =
        current.parentId === undefined
          ? undefined
          : domNodesByNodeId[current.parentId];
    }
    return false;
  }
}
