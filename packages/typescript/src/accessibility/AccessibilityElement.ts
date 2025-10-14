export class AccessibilityElement {
  id?: number;
  backendNodeId?: number;
  name?: string;
  label?: string;
  type?: string;
  value?: string;
  androidResourceId?: string;
  androidClass?: string;
  androidText?: string;
  androidContentDesc?: string;
  androidBounds?: string;

  constructor(
    id?: number,
    name?: string,
    label?: string,
    type?: string,
    value?: string,
    backendNodeId?: number,
    androidResourceId?: string,
    androidClass?: string,
    androidText?: string,
    androidContentDesc?: string,
    androidBounds?: string
  ) {
    this.id = id;
    this.backendNodeId = backendNodeId;
    this.name = name;
    this.label = label;
    this.type = type;
    this.value = value;
    this.androidResourceId = androidResourceId;
    this.androidClass = androidClass;
    this.androidText = androidText;
    this.androidContentDesc = androidContentDesc;
    this.androidBounds = androidBounds;
  }
}
