export class AccessibilityElement {
  id?: number | undefined;
  backendNodeId?: number | undefined;
  name?: string | undefined;
  label?: string | undefined;
  type?: string | undefined;
  value?: string | undefined;
  androidResourceId?: string | undefined;
  androidClass?: string | undefined;
  androidText?: string | undefined;
  androidContentDesc?: string | undefined;
  androidBounds?: string | undefined;
  frame?: object | undefined;
  locatorInfo?: Record<string, unknown> | undefined;
  frameChain?: number[] | undefined; // For Selenium: chain of iframe backendNodeIds from root to element's frame

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
    androidBounds?: string,
    frame?: object,
    locatorInfo?: Record<string, unknown>,
    frameChain?: number[],
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
    this.frame = frame;
    this.locatorInfo = locatorInfo;
    this.frameChain = frameChain;
  }
}
