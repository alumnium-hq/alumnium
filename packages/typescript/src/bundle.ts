declare const SINGLE_FILE_EXECUTABLE: boolean | undefined;

export function isSingleFileExecutable(): boolean {
  try {
    return !!SINGLE_FILE_EXECUTABLE;
  } catch {
    return false;
  }
}
