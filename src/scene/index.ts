// Interactive 3D scene: loads the exported Blender scene (ramen-shop.glb)
// into a full-viewport Three.js canvas mounted inside #app.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { DaylightRig } from './daylightRig'
import { TimeOfDayPanel } from './timePanel'
import { playBillboard } from './billboard'
import { batchStaticMeshes } from './batchMeshes'

const MODEL_URL = '/assets/models/ramen-shop.glb'
const PIXEL_BUDGET = 1_650_000
const HIGH_RES_PIXEL_BUDGET = 3_400_000
const FRAME_INTERVAL = 1000 / 30

export function initScene(container: HTMLElement, loading: {
  progress: (event: ProgressEvent) => void
  ready: () => void
  error: (error: unknown) => void
}): void {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x181c22)

  const displayPixels = window.screen.width * window.screen.height * window.devicePixelRatio ** 2
  const highResolution = displayPixels >= 7_000_000
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: highResolution })
  } catch (error) {
    loading.error(error)
    return
  }
  renderer.shadowMap.enabled = true
  container.appendChild(renderer.domElement)

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  loader.load(MODEL_URL, (gltf) => {
    // Place the exported model content.
    scene.add(gltf.scene)

    const cameras: THREE.Camera[] = []
    const signAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Camera) cameras.push(obj)
      if (!(obj instanceof THREE.Mesh)) return
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      const name = String(obj.userData.name ?? obj.name)
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial) ||
            !/sign|chalkboard|lettering|navigation|logo|banner/.test(
              `${name} ${material.name}`.toLowerCase(),
            )) continue
        for (const texture of [material.map, material.emissiveMap]) {
          if (texture) texture.anisotropy = signAnisotropy
        }
      }
    })

    const desktopCameraNames = ['Storefront Cameras | Desktop Camera', 'Desktop Camera']
    const cameraName = (camera: THREE.Camera) => camera.userData.name ?? camera.name
    const preferred = cameras.find((camera) =>
      desktopCameraNames.includes(cameraName(camera)),
    ) ?? cameras[0]
    const mobilePortrait = cameras.find((camera) => cameraName(camera) === 'Web Mobile Portrait Camera')
    const mobileLandscape = cameras.find((camera) => cameraName(camera) === 'Web Mobile Landscape Camera')

    let camera: THREE.Camera
    if (preferred) {
      // Use the exported Blender camera, preserving its composition.
      camera = preferred
    } else {
      // No exported camera: fit an isometric-style orthographic camera.
      const box = new THREE.Box3().setFromObject(gltf.scene)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const extent = Math.max(size.x, size.y, size.z)
      const ortho = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 1, 100 * extent)
      ortho.position.copy(center).addScaledVector(new THREE.Vector3(1, 1, 1).normalize(), extent * 2)
      ortho.lookAt(center)
      camera = ortho
    }

    // Time-of-day subsystem: environment cycle + practical lights for the
    // emissive objects (lanterns, sign boxes, vending machine, fixtures).
    const rig = new DaylightRig(scene, gltf.scene)
    new TimeOfDayPanel(container, (minutes) => {
      rig.setMinutes(minutes)
    })

    playBillboard(gltf.scene)
    batchStaticMeshes(gltf.scene)
    const idle = THREE.AnimationClip.findByName(gltf.animations, 'Storefront Pet Idle')
    const mixer = idle ? new THREE.AnimationMixer(gltf.scene) : undefined
    if (idle && mixer) mixer.clipAction(idle).play()
    startRendering(scene, { desktop: camera, mobilePortrait, mobileLandscape },
      renderer, container, highResolution ? HIGH_RES_PIXEL_BUDGET : PIXEL_BUDGET, rig, loading.ready, mixer)
  }, loading.progress, loading.error)
}

function startRendering(
  scene: THREE.Scene,
  views: { desktop: THREE.Camera; mobilePortrait?: THREE.Camera; mobileLandscape?: THREE.Camera },
  renderer: THREE.WebGLRenderer,
  container: HTMLElement,
  pixelBudget: number,
  rig: DaylightRig,
  onFirstFrame: () => void,
  mixer?: THREE.AnimationMixer,
): void {
  let camera = views.desktop
  const touch = window.matchMedia('(pointer: coarse)')
  const update = () => {
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === 0 || h === 0) return
    const aspect = w / h
    camera = views.desktop
    if (w <= 768 && aspect < 1) {
      camera = views.mobilePortrait ?? camera
    } else if (w <= 1024 && aspect >= 1 && touch.matches) {
      camera = views.mobileLandscape ?? camera
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = aspect
      camera.updateProjectionMatrix()
    } else if (camera instanceof THREE.OrthographicCamera) {
      const halfH = Math.abs(camera.top - camera.bottom) / 2
      camera.left = -halfH * aspect
      camera.right = halfH * aspect
      camera.updateProjectionMatrix()
    }
    rig.updateView(camera)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, Math.sqrt(pixelBudget / (w * h))))
    renderer.setSize(w, h, false)
  }

  update()
  new ResizeObserver(update).observe(container)
  window.addEventListener('resize', update)
  touch.addEventListener('change', update)

  let previousFrame: number | undefined
  renderer.setAnimationLoop((time) => {
    if (document.hidden || (previousFrame !== undefined && time - previousFrame < FRAME_INTERVAL - 1)) return
    const firstFrame = previousFrame === undefined
    if (previousFrame !== undefined) mixer?.update(Math.min((time - previousFrame) / 1000, 0.1))
    previousFrame = time
    rig.updateAtmosphere(time / 1000)
    renderer.render(scene, camera)
    if (firstFrame) onFirstFrame()
  })
}
