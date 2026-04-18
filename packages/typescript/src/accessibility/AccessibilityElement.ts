export interface AccessibilityElement {
  id?: number | undefined
  backendNodeId?: number | undefined
  name?: string | undefined
  label?: string | undefined
  type?: string | undefined
  value?: string | undefined
  androidResourceId?: string | undefined
  androidClass?: string | undefined
  androidText?: string | undefined
  androidContentDesc?: string | undefined
  androidBounds?: string | undefined
  frame?: object | undefined
  locatorInfo?: Record<string, unknown> | undefined
  frameChain?: number[] | undefined // For Selenium: chain of iframe backendNodeIds from root to element's frame
  alertAction?: string | undefined // "accept" or "dismiss" for alert dialog buttons
}
