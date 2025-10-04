import { BaseAccessibilityTree } from './BaseAccessibilityTree';
import { AccessibilityElement } from './AccessibilityElement';

interface AXNode {
  nodeId: string;
  backendDOMNodeId?: number;
  role: { value: string };
  name?: { value: string };
  ignored?: boolean;
  properties?: Array<{ name: string; value?: { value: any } }>;
  childIds?: string[];
  parentId?: string;
  id?: number;
  nodes?: AXNode[];
}

interface AXTree {
  nodes: AXNode[];
}

export class ChromiumAccessibilityTree extends BaseAccessibilityTree {
  private tree: Record<string, AXNode> = {};
  private cachedIds: Record<number, number> = {};
  private idCounter = 0;

  constructor(axTree: AXTree) {
    super();

    const nodes = axTree.nodes;
    const nodeLookup: Record<string, AXNode> = {};

    // Create lookup table
    for (const node of nodes) {
      nodeLookup[node.nodeId] = node;
    }

    // Build tree structure
    for (const [nodeId, node] of Object.entries(nodeLookup)) {
      const parentId = node.parentId;

      this.idCounter++;
      this.cachedIds[this.idCounter] = node.backendDOMNodeId || 0;
      node.id = this.idCounter;

      // If it's a top-level node, add to tree
      if (!parentId) {
        this.tree[nodeId] = node;
      } else {
        // Find parent and add as child
        const parent = nodeLookup[parentId];
        if (!parent.nodes) {
          parent.nodes = [];
        }
        parent.nodes.push(node);

        // Clean up unneeded attributes
        delete node.childIds;
        delete node.parentId;
      }
    }
  }

  elementById(id: number): AccessibilityElement {
    return new AccessibilityElement(this.cachedIds[id]);
  }

  getArea(id: number): ChromiumAccessibilityTree {
    if (!(id in this.cachedIds)) {
      throw new Error(`No element with id=${id}`);
    }

    const rootElements = Object.values(this.tree);

    const findNodeById = (nodes: AXNode[], targetId: number): AXNode | null => {
      for (const node of nodes) {
        if (node.id === targetId) {
          return node;
        }
        if (node.nodes) {
          const result = findNodeById(node.nodes, targetId);
          if (result) return result;
        }
      }
      return null;
    };

    const targetNode = findNodeById(rootElements, id);
    if (!targetNode) {
      throw new Error(`No node with id=${id} found in the tree`);
    }

    const areaTree = new ChromiumAccessibilityTree({ nodes: [] });
    areaTree.tree = { [id]: targetNode };
    areaTree.cachedIds = { ...this.cachedIds };
    return areaTree;
  }

  toXml(): string {
    const convertNodeToXml = (node: AXNode, parentEl?: XmlElement): XmlElement | null => {
      const roleValue = node.role.value;
      const id = node.id || '';
      const ignored = node.ignored || false;
      const nameValue = node.name?.value || '';
      const properties = node.properties || [];
      const children = node.nodes || [];

      if (roleValue === 'StaticText') {
        if (parentEl) {
          parentEl.text = nameValue;
        }
        return null;
      } else if (roleValue === 'none' || ignored) {
        if (children && parentEl) {
          for (const child of children) {
            convertNodeToXml(child, parentEl);
          }
        }
        return null;
      } else if (roleValue === 'generic' && children.length === 0) {
        return null;
      } else {
        const xmlElement = new XmlElement(roleValue);

        if (nameValue) {
          xmlElement.attrs.name = nameValue;
        }

        xmlElement.attrs.id = String(id);

        for (const property of properties) {
          xmlElement.attrs[property.name] = String(property.value?.value || '');
        }

        if (children) {
          for (const child of children) {
            convertNodeToXml(child, xmlElement);
          }
        }

        if (parentEl) {
          parentEl.children.push(xmlElement);
        }

        return xmlElement;
      }
    };

    const rootElements: XmlElement[] = [];
    for (const rootId of Object.keys(this.tree)) {
      const element = convertNodeToXml(this.tree[rootId]);
      if (element) {
        this.pruneRedundantName(element);
        rootElements.push(element);
      }
    }

    return rootElements.map((el) => el.toString()).join('');
  }

  private pruneRedundantName(node: XmlElement): string[] {
    // Remove name if it equals text
    if (node.attrs.name && node.text && node.attrs.name === node.text) {
      delete node.attrs.name;
    }

    if (node.children.length === 0) {
      return this.getTexts(node);
    }

    // Recursively process children
    const descendantContent: string[] = [];
    for (const child of node.children) {
      descendantContent.push(...this.pruneRedundantName(child));
    }

    // Sort by length, longest first
    descendantContent.sort((a, b) => b.length - a.length);

    for (const content of descendantContent) {
      if (node.attrs.name) {
        node.attrs.name = node.attrs.name.replace(content, '').trim();
      }
      if (node.attrs.label) {
        node.attrs.label = node.attrs.label.replace(content, '').trim();
      }
      if (node.text) {
        node.text = node.text.replace(content, '').trim();
      }
    }

    const currentSubtreeContent = [...descendantContent];
    if (node.attrs.name) {
      currentSubtreeContent.push(...this.getTexts(node));
    }

    return currentSubtreeContent;
  }

  private getTexts(node: XmlElement): string[] {
    const texts = new Set<string>();
    if (node.attrs.name) texts.add(node.attrs.name);
    if (node.attrs.label) texts.add(node.attrs.label);
    if (node.text) texts.add(node.text);
    return Array.from(texts);
  }
}

class XmlElement {
  tag: string;
  attrs: Record<string, string> = {};
  text: string = '';
  children: XmlElement[] = [];

  constructor(tag: string) {
    this.tag = tag;
  }

  toString(indent: number = 0): string {
    const indentStr = '  '.repeat(indent);
    const attrsStr = Object.entries(this.attrs)
      .filter(([_, v]) => v !== '')
      .map(([k, v]) => `${k}="${this.escapeXml(v)}"`)
      .join(' ');

    const openTag = attrsStr ? `<${this.tag} ${attrsStr}>` : `<${this.tag}>`;

    if (this.children.length === 0 && !this.text) {
      return `${indentStr}${openTag.slice(0, -1)} />\n`;
    }

    let result = `${indentStr}${openTag}`;

    if (this.text) {
      result += this.escapeXml(this.text);
    }

    if (this.children.length > 0) {
      result += '\n';
      for (const child of this.children) {
        result += child.toString(indent + 1);
      }
      result += indentStr;
    }

    result += `</${this.tag}>\n`;

    return result;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
