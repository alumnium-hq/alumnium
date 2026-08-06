# Alumnium Assets

The `./mise.toml` tasks manage files in the following directories:

- `../websites/docs/public/`: favicons, web app icons
- `../websites/docs/src/assets/`:
  - `<assets>`: logos, favicons,
  - `<assets>/logos/`: 3rd-party logos (entire directory)

The assets in `./exports` are used as the source and exported from the `./assets.af` and `./logos.af` [Affinity](https://www.affinity.studio/) files.

## Editing Assets

Use [Affinity](https://www.affinity.studio/) to edit the asset files.

Make sure to commit `.af` files as well as any exported assets (and symlinks) to the repository.

## Exporting Assets

After editing the Affinity files:

1. Open [Slice Studio](https://www.affinity.studio/help/workspace-slice-studio/) in the editor
2. Press the _Export Slices_ button.
3. Select the assets directory (`<repo>/assets`) and press _Export_ in file dialog.
4. In the _Export_ dialog, keep all files selected and press _Export_.

It will export the assets to the `./exports` directory. Then run:

```bash
mise //assets:build
```

It will optimize, generate new assets, and symlink them to the correct locations.

Make sure to commit the exported assets and symlinks to the repository.
