// Ramen-stall blockout scene: a small stall between much larger buildings,
// street/sidewalk geometry, and day/night lighting state.

import * as THREE from 'three'

export interface RamenSceneApi {
  setDayNight(t: number): void
  dispose(): void
}

const NIGHT = 1

// Base-color interpolation registry: material + day/night colors.
interface ColorEntry {
  mat: THREE.MeshStandardMaterial
  day: THREE.Color
  night: THREE.Color
}

export function createRamenScene(container: HTMLElement): RamenSceneApi {
  const width = container.clientWidth || window.innerWidth
  const height = container.clientHeight || window.innerHeight

  const scene = new THREE.Scene()
  const background = new THREE.Color()
  scene.background = background

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200)
  camera.position.set(-3.5, 6.5, 14)
  camera.lookAt(new THREE.Vector3(0.8, 2.2, -0.5))

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  // --- Materials ---------------------------------------------------------

  const facadeMat = new THREE.MeshStandardMaterial()
  const streetMat = new THREE.MeshStandardMaterial()
  const sidewalkMat = new THREE.MeshStandardMaterial()
  const woodMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a6b4f') })
  const roofMat = new THREE.MeshStandardMaterial()
  const windowPanelMat = new THREE.MeshStandardMaterial()
  const lanternMat = new THREE.MeshStandardMaterial()

  const colors: ColorEntry[] = []
  function register(
    mat: THREE.MeshStandardMaterial,
    dayHex: string,
    nightHex: string,
  ): void {
    mat.color.set(dayHex)
    colors.push({ mat, day: new THREE.Color(dayHex), night: new THREE.Color(nightHex) })
  }

  register(facadeMat, '#d8d5cc', '#2a3140')
  register(streetMat, '#6b7178', '#1c2230')
  register(sidewalkMat, '#cfc9bd', '#3a4150')
  register(roofMat, '#d8d5cc', '#2a3140')

  // --- Geometry ----------------------------------------------------------

  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)

  function addBox(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    scene.add(mesh)
    return mesh
  }

  // Street slab and sidewalk.
  addBox(box(40, 0.5, 28), streetMat, 0, -0.25, 0).receiveShadow = true
  addBox(box(24, 0.12, 3), sidewalkMat, 0, 0.06, 1.5).receiveShadow = true

  // Buildings: much larger than the stall, leaving an eight-unit gap.
  const leftBuilding = addBox(box(6, 16, 14), facadeMat, -7, 8, -1)
  leftBuilding.castShadow = true
  leftBuilding.receiveShadow = true
  const rightBuilding = addBox(box(6, 13, 14), facadeMat, 7, 6.5, -1)
  rightBuilding.castShadow = true
  rightBuilding.receiveShadow = true

  // Building window panels (lighting blockout, not finished signage).
  addBox(box(3.4, 8, 0.2), windowPanelMat, -6.5, 7, 6.1)
  addBox(box(3.4, 8, 0.2), windowPanelMat, 6.5, 7, 6.1)

  // Stall: counter, supports, gabled roof.
  const counter = addBox(box(3.2, 1, 0.9), woodMat, 0, 0.5, -2)
  counter.castShadow = true
  counter.receiveShadow = true

  function support(x: number): void {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.9), woodMat)
    post.position.set(x, 0.95, -2)
    scene.add(post)
  }
  support(-1.4)
  support(1.4)

  // Gabled roof: two slabs meeting at the ridge above the counter.
  const roofL = addBox(box(3.6, 0.12, 1.5), roofMat, -0.9, 2.05, -2)
  roofL.rotation.z = -Math.PI / 8
  const roofR = addBox(box(3.6, 0.12, 1.5), roofMat, 0.9, 2.05, -2)
  roofR.rotation.z = Math.PI / 8

  // Lanterns.
  function lantern(x: number): void {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), lanternMat)
    sphere.position.set(x, 2.6, -1.2)
    scene.add(sphere)
  }
  lantern(-2)
  lantern(2)

  // --- Lights --------------------------------------------------------------

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7f6f, 0.9)
  scene.add(hemi)

  const sun = new THREE.DirectionalLight('#fff3e0', 1.2)
  sun.position.set(4, 10, 6)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = -15
  sun.shadow.camera.right = 15
  sun.shadow.camera.top = 15
  sun.shadow.camera.bottom = -15
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 30
  scene.add(sun)

  const lanternLights: THREE.PointLight[] = []
  for (const x of [-2, 2]) {
    const light = new THREE.PointLight('#ffe9c8', 0, 7, 2)
    light.position.set(x, 2.6, -1.2)
    scene.add(light)
    lanternLights.push(light)
  }

  const interiorFill = new THREE.PointLight('#ffe9c8', 0, 5, 2)
  interiorFill.position.set(0, 2.4, -1.8)
  scene.add(interiorFill)

  // --- Day/night state -----------------------------------------------------

  let currentT = NIGHT
  let targetT = NIGHT

  const skyDay = new THREE.Color('#8fb3d5')
  const skyNight = new THREE.Color('#0a1426')
  const hemiSkyDay = new THREE.Color('#ffffff')
  const hemiSkyNight = new THREE.Color('#1a2a4a')
  const hemiGroundDay = new THREE.Color('#8a7f6f')
  const hemiGroundNight = new THREE.Color('#0a0a14')
  const sunColorDay = new THREE.Color('#fff3e0')
  const sunColorNight = new THREE.Color('#4a6a9f')

  function applyDayNight(): void {
    const t = currentT
    background.copy(skyDay).lerp(skyNight, t)
    hemi.color.copy(hemiSkyDay).lerp(hemiSkyNight, t)
    hemi.groundColor.copy(hemiGroundDay).lerp(hemiGroundNight, t)
    hemi.intensity = 0.9 + (0.15 - 0.9) * t
    sun.color.copy(sunColorDay).lerp(sunColorNight, t)
    sun.intensity = 1.2 + (0.25 - 1.2) * t
    for (const entry of colors) {
      entry.mat.color.copy(entry.day).lerp(entry.night, t)
    }
    windowPanelMat.emissive.set('#ffe9c8')
    windowPanelMat.emissiveIntensity = 2.5 * t
    lanternMat.emissive.set('#ffe9c8')
    lanternMat.emissiveIntensity = 2 * t
    for (const light of lanternLights) {
      light.intensity = 15 * t
    }
    interiorFill.intensity = 6 * t
  }

  // --- Frame loop ----------------------------------------------------------

  let rafId: number | undefined
  let lastTime = performance.now() / 1000

  function tick(): void {
    const now = performance.now() / 1000
    const dt = Math.min(0.1, now - lastTime)
    lastTime = now
    currentT += (targetT - currentT) * Math.min(1, dt * 4)
    applyDayNight()
    renderer.render(scene, camera)
    rafId = requestAnimationFrame(tick)
  }

  tick()

  // --- Sizing ----------------------------------------------------------------

  function setSize(): void {
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }

  window.addEventListener('resize', setSize)

  // --- Disposal --------------------------------------------------------------

  function dispose(): void {
    if (rafId !== undefined) cancelAnimationFrame(rafId)
    rafId = undefined
    window.removeEventListener('resize', setSize)
    renderer.dispose()
    container.removeChild(renderer.domElement)
    for (const entry of colors) {
      entry.mat.dispose()
    }
  }

  return {
    setDayNight(t: number): void {
      targetT = Math.min(1, Math.max(0, t))
    },
    dispose,
  }
}
