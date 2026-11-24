# Sneeky Softworks Website

The Sneeky Softworks studio site opens on an interactive isometric ramen shop rendered in Three.js. The storefront signs lead to Games, Software, About, and In Development. The scene switches between desktop and mobile views, and its time slider lets visitors preview the lighting throughout the day.

**Live site** · [Sneeky Softworks on GitHub Pages](https://sebastian-brown.github.io/Sneeky-softworks-website/)

## Run locally

Use Node.js 24, which matches the deployment workflow.

```sh
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173/). In Windows PowerShell, use `npm.cmd` in place of `npm` if script execution is blocked. The repository includes the exported storefront model, so a fresh checkout can run without Blender.

## Edit the storefront

1. Put `ramen_shop_scene_Qwen_naming.blend` in `blender-source.local/` and make sure `blender` is on your PATH.
2. Run the dev server and save your scene in Blender. Vite checks the timestamps of the `.blend` and `.blend1` files and, when it finds a newer save, exports it and reloads the browser. Refreshing the storefront also checks for a newer save.
3. To export the main `.blend` file manually, run `npm run export:scene`. The exporter reads the Blender scene named **Storefront** and writes `public/assets/models/ramen-shop.glb`.
4. Commit the updated GLB when you want the scene change included in the next deployment. The Blender source folder is ignored by Git.

## Build and deploy

```sh
npm run build
npm run preview
```

The build command runs TypeScript checks and uses Vite to build the five HTML entry points into `dist/`. GitHub Pages serves this static output. The About contact form opens an email draft in the visitor’s mail app.

The [GitHub Pages workflow](.github/workflows/deploy.yml) runs on pushes to `main` and can also be started manually from [GitHub Actions](https://github.com/Sebastian-Brown/Sneeky-softworks-website/actions/workflows/deploy.yml). It sets the Vite base path from the Pages configuration, then builds and publishes `dist/` using the committed assets.

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html` and `src/main.ts` | Storefront entry point |
| `games/`, `software/`, `about/`, `in-development/` | Interior page entry points |
| `src/scene/` | Three.js renderer, cameras, lighting, fog, breeze, and billboard |
| `public/assets/` | Exported storefront GLB, page artwork, and billboard video |
| `scripts/export_storefront.py` | Blender-to-GLB exporter |
| `vite.config.js` | HTML build entries and local Blender save watcher |
