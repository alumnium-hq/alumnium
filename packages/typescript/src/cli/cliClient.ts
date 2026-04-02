export async function cliBinPath(): Promise<string> {
  const os = process.platform === "win32" ? "windows" : process.platform;
  const arch = process.arch;
  const pkg = await import(`@alumnium/cli-${os}-${arch}`);
  return pkg.binPath();
}
