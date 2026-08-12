import { describe, expect, it } from "vitest";
import { enrichChromiumAXNodes } from "./enrichChromiumAXNodes.ts";

describe("enrichChromiumAXNodes", () => {
  it("marks only addressable DOM elements", () => {
    const axNodes = [
      { backendDOMNodeId: 10 },
      { backendDOMNodeId: 11 },
      { backendDOMNodeId: 12 },
      { backendDOMNodeId: 13 },
      { backendDOMNodeId: 14 },
      {},
    ];
    const domNodes = [
      { nodeId: 1, backendNodeId: 10, nodeType: 1 },
      { nodeId: 2, backendNodeId: 11, nodeType: 3 },
      {
        nodeId: 3,
        backendNodeId: 12,
        nodeType: 1,
        pseudoType: "before",
      },
      {
        nodeId: 4,
        backendNodeId: 40,
        nodeType: 11,
        shadowRootType: "user-agent",
      },
      { nodeId: 5, backendNodeId: 13, nodeType: 1, parentId: 4 },
      {
        nodeId: 6,
        backendNodeId: 60,
        nodeType: 11,
        shadowRootType: "open",
      },
      { nodeId: 7, backendNodeId: 14, nodeType: 1, parentId: 6 },
    ];

    enrichChromiumAXNodes(axNodes, domNodes);

    expect(axNodes).toEqual([
      { backendDOMNodeId: 10, _mutable: true },
      { backendDOMNodeId: 11, _mutable: false },
      { backendDOMNodeId: 12, _mutable: false },
      { backendDOMNodeId: 13, _mutable: false },
      { backendDOMNodeId: 14, _mutable: true },
      { _mutable: false },
    ]);
  });

  it("indexes shadow roots nested on their host", () => {
    const axNodes = [{ backendDOMNodeId: 21 }];

    enrichChromiumAXNodes(axNodes, [
      {
        nodeId: 1,
        backendNodeId: 20,
        nodeType: 1,
        shadowRoots: [
          {
            nodeId: 2,
            backendNodeId: 200,
            nodeType: 11,
            shadowRootType: "user-agent",
          },
        ],
      },
      { nodeId: 3, backendNodeId: 21, nodeType: 1, parentId: 2 },
    ]);

    expect(axNodes).toEqual([{ backendDOMNodeId: 21, _mutable: false }]);
  });
});
