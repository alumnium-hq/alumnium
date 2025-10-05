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
}
