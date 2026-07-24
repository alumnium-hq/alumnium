type ProxyConfig = {
  server: string;
  bypass?: string;
  username?: string;
  password?: string;
};

export function proxyFromEnv(): ProxyConfig | null {
  // oxlint-disable-next-line no-process-env -- reading standard proxy env vars not managed by Env
  const raw =
    // oxlint-disable-next-line no-process-env -- reading standard proxy env vars not managed by Env
    process.env["http_proxy"] ??
    // oxlint-disable-next-line no-process-env -- reading standard proxy env vars not managed by Env
    process.env["HTTP_PROXY"] ??
    // oxlint-disable-next-line no-process-env -- reading standard proxy env vars not managed by Env
    process.env["https_proxy"] ??
    // oxlint-disable-next-line no-process-env -- reading standard proxy env vars not managed by Env
    process.env["HTTPS_PROXY"];
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return {
      server: url.protocol + "//" + url.host,
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    };
  } catch {
    return null;
  }
}
