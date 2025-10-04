export class AccessibilityElement {
  id: number;
  name?: string;
  label?: string;
  type?: string;
  value?: string;

  constructor(id: number, name?: string, label?: string, type?: string, value?: string) {
    this.id = id;
    this.name = name;
    this.label = label;
    this.type = type;
    this.value = value;
  }
}
