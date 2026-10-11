# Architecture

This document records the intended separation of concerns for the Sneeky Softworks website. It establishes architecture only; individual subsystems are not designed until they exist.

## Overview

The site is a static, client-rendered application built with Vite and TypeScript (no framework). The final landing page will be an interactive isometric ramen shop scene rendered with Three.js in the browser.

```
index.html            HTML entry point; #app container
src/
  main.ts             Bootstrap: wires everything together at startup
  styles.css          Global styles
  components/         Reusable UI/navigation modules
  scene/              3D scene systems (Three.js)
  content/            Site content/data
public/               Static assets served as-is from the site root
docs/                 Project documentation
```

## Separation of concerns

### Application / bootstrap code

- `index.html` — document structure and the `#app` container.
- `src/main.ts` — single entry point that initializes scene systems and UI modules and mounts them into `#app`. Nothing else in the app bootstrates itself; all startup happens here.

### 3D scene systems (`src/scene/`)

- All Three.js work lives here: renderer setup, scene graph construction, lighting, animation, day/night behavior, drawing/chalkboard interaction, and any game-like systems.
- Scene code is self-contained: it receives a mount target (and later, content data) and exposes its lifecycle; it does not reach into UI modules or bootstrap code.

### UI / navigation (`src/components/`)

- Reusable interface modules: navigation, overlays, menus, accessibility controls.
- Components render DOM and handle user input; they communicate with scene systems through a narrow API rather than touching Three.js internals directly.

### Assets

- `public/assets/models/` — 3D models (GLB/GLTF), served at `/assets/models/`.
- `public/assets/textures/` — textures and images, served at `/assets/textures/`.
- Files in `public/` are served as-is and copied unchanged into the build output; they are referenced by URL path.
- Assets that must be imported from code (bundled/hashed by Vite) go under `src/assets/` instead.

### Content / data (`src/content/`)

- Structured site content: navigation items, text copy, and future scene content definitions (e.g., what appears in the ramen shop).
- Data is consumed by UI and scene systems but contains no rendering logic.

### Styling

- `src/styles.css` — global styles, design tokens, and layout for the page shell.
- Component-specific styling lives with or alongside its component module as they are introduced.

### Deployment configuration

- None today: Vite produces a fully static build (`dist/`) that can be served by any static host.
- The intended host is Cloudflare Pages; deployment configuration will be added when hosting is set up (not part of this foundation).

## Ground rules

1. `src/main.ts` remains the only bootstrap entry point.
2. Scene systems stay inside `src/scene/`; UI stays inside `src/components/`.
3. Static assets are referenced by URL from `public/`; code-imported assets live under `src/assets/`.
4. Content/data is plain data, not logic.
5. No deployment configuration until hosting is actually set up.
