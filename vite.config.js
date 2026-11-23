import { execFile, spawn } from 'node:child_process'
import { unwatchFile, watchFile } from 'node:fs'
import { mkdtemp, rename, rm, rmdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { defineConfig } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))
const sourceFolder = join(root, 'blender-source.local')
const sources = [
  join(sourceFolder, 'ramen_shop_scene_Qwen_naming.blend'),
  join(sourceFolder, 'ramen_shop_scene_Qwen_naming.blend1'),
]
const modelUrl = '/assets/models/ramen-shop.glb'
const output = join(root, 'public', modelUrl)
const exporter = join(root, 'scripts/export_storefront.py')
const execFileAsync = promisify(execFile)

async function modifiedAt(path) {
  try {
    return (await stat(path)).mtimeMs
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return 0
  }
}

async function latestSave() {
  const [main, alternate] = await Promise.all(sources.map(modifiedAt))
  return alternate > main ? { path: sources[1], time: alternate } : { path: sources[0], time: main }
}

function exportModel(source, destination) {
  return new Promise((resolve, reject) => {
    const process = spawn('blender', [
      '-b', source, '--python-exit-code', '1', '--python',
      exporter, '--', destination,
    ], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    const retainTail = (chunk) => { log = (log + chunk).slice(-5000) }
    process.stdout.on('data', retainTail)
    process.stderr.on('data', retainTail)
    process.on('error', reject)
    process.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Blender export exited with code ${code}.\n${log}`))
    })
  })
}

async function publishModel(candidate) {
  try {
    await rename(candidate, output)
  } catch (error) {
    if (process.platform !== 'win32' || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error
    // Replace atomically on Windows while another process has the old model open.
    const backup = join(dirname(candidate), 'previous-model.glb')
    await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      '$ErrorActionPreference = "Stop"; [IO.File]::Replace($env:STOREFRONT_CANDIDATE, $env:STOREFRONT_OUTPUT, $env:STOREFRONT_BACKUP)',
    ], {
      windowsHide: true,
      env: {
        ...process.env,
        STOREFRONT_CANDIDATE: candidate,
        STOREFRONT_OUTPUT: output,
        STOREFRONT_BACKUP: backup,
      },
    })
    await rm(backup, { force: true })
  }
}

function refreshStorefront() {
  let pending
  return {
    name: 'refresh-storefront',
    apply: 'serve',
    configureServer(server) {
      async function refresh() {
        let save = await latestSave()
        if (Math.max(save.time, await modifiedAt(exporter)) <= await modifiedAt(output)) return
        server.config.logger.info('Blender save detected. Exporting the storefront…')
        const staging = await mkdtemp(join(sourceFolder, 'web-export-'))
        const candidate = join(staging, 'ramen-shop.glb')
        try {
          // A save during export triggers a fresh pass before the browser gets the model.
          while (save.time) {
            await exportModel(save.path, candidate)
            const latest = await latestSave()
            if (latest.path === save.path && latest.time === save.time) {
              await publishModel(candidate)
              server.config.logger.info('Updated the storefront model.')
              return true
            }
            save = latest
          }
        } finally {
          await rm(candidate, { force: true })
          await rmdir(staging)
        }
      }

      function refreshOnce() {
        pending ??= refresh().finally(() => { pending = undefined })
        return pending
      }

      // Blender can replace the file on save. Poll the path so the watcher
      // continues to work after a replacement, even when no tab requests the map.
      async function onBlenderSave(current, previous) {
        if (!current.mtimeMs || (current.mtimeMs === previous.mtimeMs && current.size === previous.size)) return
        try {
          if (await refreshOnce()) server.ws.send({ type: 'full-reload', path: '*' })
        } catch (error) {
          server.config.logger.error(error.stack ?? String(error))
        }
      }
      for (const source of sources) watchFile(source, { interval: 750, persistent: false }, onBlenderSave)
      server.httpServer?.once('close', () => {
        for (const source of sources) unwatchFile(source, onBlenderSave)
      })

      server.middlewares.use(async (request, response, next) => {
        if (request.method !== 'GET' || request.url?.split('?', 1)[0] !== modelUrl) {
          return next()
        }
        try {
          await refreshOnce()
          next()
        } catch (error) {
          server.config.logger.error(error.stack ?? String(error))
          response.statusCode = 503
          response.statusMessage = 'Blender export failed. Check the Vite terminal.'
          response.end('Could not export the latest Blender save. Check the Vite terminal.')
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [refreshStorefront()],
  optimizeDeps: {
    entries: ['index.html'],
  },
  build: {
    rolldownOptions: {
      input: [
        join(root, 'index.html'),
        join(root, 'games/index.html'),
        join(root, 'software/index.html'),
        join(root, 'about/index.html'),
        join(root, 'in-development/index.html'),
      ],
    },
  },
  server: {
    watch: {
      // The dedicated watcher reloads only after a validated export is ready.
      ignored: ['**/blender-source.local/**', '**/public/assets/models/ramen-shop.glb'],
    },
  },
})
