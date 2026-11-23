// Application bootstrap entry point.
// The #app element in index.html is the full-viewport canvas host; this file
// mounts the 3D scene (src/scene) into it and owns all runtime initialization.

import { initScene } from './scene/index.ts'

const app = document.querySelector<HTMLElement>('#app')
const loading = app?.querySelector<HTMLElement>('.scene-status')
const title = loading?.querySelector('h1')
const detail = loading?.querySelector('p')
const progress = loading?.querySelector('progress')
const retry = loading?.querySelector('button')

if (app && loading && title && detail && progress && retry) {
  retry.addEventListener('click', () => window.location.reload())
  initScene(app, {
    progress(event) {
      if (event.lengthComputable && event.total > 0) {
        progress.value = Math.min(95, event.loaded / event.total * 100)
      }
    },
    ready() {
      loading.remove()
    },
    error(error) {
      console.error('Storefront failed to load', error)
      title.textContent = 'The shop couldn’t open'
      detail.textContent = 'Try loading the 3D scene again.'
      progress.hidden = true
      retry.hidden = false
    },
  })
}
