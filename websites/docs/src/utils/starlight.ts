export function isBareStarlightPage(locals: App.Locals) {
  // NOTE: This is a hack to get rid of backed-in Starlight components.
  // The `Astro.locals.starlightRoute.entry.data.bare` workaround doesn't work
  // with the built version for whatever reason.
  const entryId = (locals as any).starlightRoute.entry.id;
  return entryId === "" || entryId.startsWith("blog");
}
