# Sneeky Softworks Website

Official website for [Sneeky Softworks](https://sneekysoftworks.com), an independent game and software publisher.

The final site will be an interactive isometric ramen shop scene rendered with Three.js in the browser. The current page is a temporary placeholder landing page while that work is underway.

## Technology

- **Vite** — dev server, HMR, and production build
- **TypeScript** — type-checked source (vanilla modules, no framework)
- **Three.js** — installed for the upcoming 3D scene; not yet used in code

The stack intentionally stays lightweight: a graphics-heavy site benefits from minimal framework overhead around the renderer.

## Getting started

Prerequisites: Node.js (current LTS or newer).

```bash
npm install        # install dependencies
npm run dev        # start local development server → http://localhost:5173
```

With Blender on your PATH, save the **Storefront** scene while Vite is running. Vite checks `blender-source.local/ramen_shop_scene_Qwen_naming.blend` and the `.blend1` copy if it is being used for editing, exports the newer save, and reloads the open page once the map is ready. A manual browser refresh also checks for a newer save. On Windows PowerShell, `npm.cmd run dev` also works.

## Production build

The site loads `/assets/models/ramen-shop.glb`, exported from the **Storefront** scene in `blender-source.local/ramen_shop_scene_Qwen_naming.blend`. If you haven't already refreshed the map in development, run `npm run export:scene` with Blender on your PATH before building for deployment.

```bash
npm run build      # type-check, then build the static site into dist/
npm run preview    # serve the production build locally to verify it
```

The output is a fully static site (`dist/`) with no server-side component. It can be deployed as-is; the intended host is Cloudflare Pages (not yet configured).

## Project structure

```
index.html              HTML entry point (#app container)
src/
  main.ts               Bootstrap entry point (scene/UI initialization will live here)
  styles.css            Global styles
  components/           Reusable UI/navigation modules (future)
  scene/                3D scene systems, Three.js (future)
  content/              Site content/data (future)
public/                 Static assets served as-is at the site root
  favicon.svg
  assets/models/        Future GLB/GLTF models (served at /assets/models/)
  assets/textures/      Future textures/images (served at /assets/textures/)
docs/                   Project documentation
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the intended architecture.
