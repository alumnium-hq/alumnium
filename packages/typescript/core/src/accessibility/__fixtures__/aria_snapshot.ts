import type { AriaAccessibilityTree } from "../AriaAccessibilityTree.ts";

/** ARIA snapshot of a TodoMVC page taken by acquiescence in Firefox. */
export const todoAriaSnapshot: AriaAccessibilityTree.Source = {
  root: {
    role: "fragment",
    name: "",
    children: [
      { role: "heading", name: "todos", ref: "e1", level: 1, children: [] },
      {
        role: "textbox",
        name: "What needs to be done?",
        ref: "e2",
        placeholder: "What needs to be done?",
        children: [],
      },
      {
        role: "list",
        name: "",
        ref: "e3",
        children: [
          {
            role: "listitem",
            name: "",
            ref: "e4",
            children: [
              {
                role: "checkbox",
                name: "",
                ref: "e5",
                checked: false,
                children: [],
              },
              "buy milk",
              { role: "button", name: "×", ref: "e6", children: [] },
            ],
          },
        ],
      },
      "0 items left",
    ],
  },
  sharedIds: {
    e1: "shared-1",
    e2: "shared-2",
    e3: "shared-3",
    e4: "shared-4",
    e5: "shared-5",
    e6: "shared-6",
  },
};

/** ARIA snapshot of a page with an iframe nesting another iframe. */
export const framesAriaSnapshot: AriaAccessibilityTree.Source = {
  root: {
    role: "fragment",
    name: "",
    children: [
      { role: "button", name: "Top", ref: "e1", children: [] },
      { role: "iframe", name: "", ref: "e2", children: [] },
    ],
  },
  sharedIds: { e1: "shared-1", e2: "shared-2" },
  frames: {
    e2: {
      root: {
        role: "fragment",
        name: "Outer",
        children: [
          { role: "button", name: "Outer", ref: "e1", children: [] },
          { role: "iframe", name: "", ref: "e2", children: [] },
        ],
      },
      sharedIds: { e1: "shared-3", e2: "shared-4" },
      frames: {
        e2: {
          root: {
            role: "fragment",
            name: "Inner",
            children: [
              { role: "button", name: "Inner", ref: "e1", children: [] },
            ],
          },
          sharedIds: { e1: "shared-5" },
        },
      },
    },
  },
};
