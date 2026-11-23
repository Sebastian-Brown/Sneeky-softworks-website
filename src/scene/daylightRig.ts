import * as THREE from 'three'
import { sampleEnvironment } from './daylight'
import { StreetMist } from './streetMist'
import { collectEmissiveMaterials, findPracticalLights, type EmissiveMaterialEntry } from './emitters'

/**
 * Owns the scene's time-of-day lighting: environment (background,
 * hemisphere, directional) plus practical lights attached to emissive
 * objects. One setMinutes() call applies everything for a given minute.
 */
export class DaylightRig {
  private readonly scene: THREE.Scene
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1)
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1)
  private readonly nightFog = new THREE.FogExp2(0x3a4960, 0)
  private readonly streetMist: StreetMist
  private readonly streetFill = new THREE.DirectionalLight()
  private readonly sideFill = new THREE.DirectionalLight()
  private readonly practicals: Array<{ light: THREE.Light; baseIntensity: number; daylightFraction: number }>
  private readonly emissives: EmissiveMaterialEntry[]
  private readonly roomFills: THREE.PointLight[] = []

  constructor(scene: THREE.Scene, modelRoot: THREE.Object3D) {
    this.scene = scene
    this.streetMist = new StreetMist(scene)
    scene.add(this.hemi)
    scene.add(this.sun)
    // A fixed, oblique light keeps local shadows under eaves and around trim
    // as the sun moves. Its map can be reused because the storefront is static.
    const bounds = new THREE.Box3().setFromObject(modelRoot)
    const { center, radius } = bounds.getBoundingSphere(new THREE.Sphere())
    const reach = Math.max(radius, 1)
    this.streetFill.target.position.copy(center)
    this.streetFill.position.copy(center).addScaledVector(
      new THREE.Vector3(-1, 0.95, 0.72).normalize(), reach * 2,
    )
    this.streetFill.castShadow = true
    const shadow = this.streetFill.shadow
    shadow.mapSize.set(2048, 2048)
    shadow.camera.left = shadow.camera.bottom = -reach
    shadow.camera.right = shadow.camera.top = reach
    shadow.camera.near = reach * 0.9
    shadow.camera.far = reach * 3.1
    shadow.camera.updateProjectionMatrix()
    shadow.normalBias = 0.015
    shadow.bias = -0.00015
    shadow.radius = 3
    shadow.intensity = 0.72
    shadow.autoUpdate = false
    shadow.needsUpdate = true
    scene.add(this.streetFill.target)
    this.sideFill.position.set(0.12, 0.46, 1)
    scene.add(this.streetFill, this.sideFill)

    modelRoot.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      // Blended panes must not cast opaque shadows over the rooms behind them.
      object.castShadow = materials.every((material) =>
        !material.transparent &&
        (!(material instanceof THREE.MeshPhysicalMaterial) || material.transmission === 0),
      )
      object.receiveShadow = object.castShadow
      // Posed pets move while the storefront shadow map is cached.
      if (object instanceof THREE.SkinnedMesh) object.castShadow = false
    })

    const { lights } = findPracticalLights(modelRoot)
    this.practicals = lights.map(({ object, light }) => {
      light.castShadow = false
      if (light instanceof THREE.SpotLight) {
        // Aim the spot straight down in the object's local space so it
        // stays attached while the object transforms.
        light.target.position.set(0, -1.6, 0)
        object.add(light.target)
      }
      return { light, baseIntensity: light.intensity, daylightFraction: 0 }
    })
    const roomSpots: THREE.SpotLight[] = []
    modelRoot.traverse((object) => {
      if (!(object instanceof THREE.SpotLight)) return
      const name = object.userData.name ?? object.name
      if (typeof name !== 'string' || !name.startsWith('Fixture Light | ')) return
      const roof = name.startsWith('Fixture Light | Ramen Roof Sign')
      const baseIntensity = object.intensity * 0.015
      const rightRoom = name.startsWith('Fixture Light | Right Building Interior')
      const windowRoom = rightRoom ||
        name.startsWith('Fixture Light | Left Building Interior') ||
        name.startsWith('Fixture Light | Middle Building')
      if (windowRoom) {
        // The web renderer has no bounced light. A short-range room light
        // below the fixture reaches the vertical surfaces seen through glass.
        const fill = new THREE.PointLight(object.color, baseIntensity, 4)
        fill.name = name + ' room fill'
        fill.position.copy(object.getWorldPosition(new THREE.Vector3()))
        if (rightRoom && name.endsWith('Ground level ceiling fixture')) {
          // This room has a tall ceiling and its glass doors are offset from the fixture.
          fill.position.add(new THREE.Vector3(0.8, -2.1, -0.3))
        } else {
          fill.position.add(new THREE.Vector3(rightRoom ? 0 : -0.7, -0.85, rightRoom ? 0.35 : 0))
        }
        scene.add(fill)
        this.roomFills.push(fill)
        this.practicals.push({ light: fill, baseIntensity, daylightFraction: 0.55 })
        roomSpots.push(object)
        return
      }
      // Keep the warmth inside its room, even if the exporter omitted a range.
      if (object.distance === 0) object.distance = roof ? 3.4 : 5
      this.practicals.push({
        light: object,
        // Fit the exported photometric intensity to the existing web light rig.
        baseIntensity,
        daylightFraction: roof ? 0.28 : 0.46,
      })
    })
    // Remove these after traversal so sibling fixtures aren't skipped.
    for (const spot of roomSpots) spot.removeFromParent()

    this.emissives = collectEmissiveMaterials(modelRoot)
  }

  /** Skip room lights whose entire influence is outside the active view. */
  updateView(camera: THREE.Camera): void {
    camera.updateWorldMatrix(true, false)
    const viewProjection = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix, camera.matrixWorldInverse,
    )
    const frustum = new THREE.Frustum().setFromProjectionMatrix(viewProjection)
    const influence = new THREE.Sphere()
    for (const light of this.roomFills) {
      influence.center.copy(light.position)
      influence.radius = light.distance
      // Keep time-of-day visibility independent of camera selection.
      if (frustum.intersectsSphere(influence)) light.layers.enable(0)
      else light.layers.disable(0)
    }
  }

  /** Apply the full day/night state for a minute-of-day (0..1439). */
  setMinutes(minutes: number): void {
    const env = sampleEnvironment(minutes)
    this.scene.background = env.background
    this.nightFog.density = 0.0026 * env.fogStrength
    this.scene.fog = env.fogStrength > 0 ? this.nightFog : null
    this.streetMist.setStrength(env.fogStrength)

    this.hemi.color.copy(env.hemiSky)
    this.hemi.groundColor.copy(env.hemiGround)
    this.hemi.intensity = env.hemiIntensity

    this.sun.position.copy(env.sunDirection)
    this.sun.color.copy(env.sunColor)
    this.sun.intensity = env.sunIntensity * 0.82

    const glow = env.nightFactor
    const daylight = 1 - glow
    this.streetFill.color.setHex(0xdfebff).lerp(env.hemiSky, 0.15 + daylight * 0.43)
    this.streetFill.intensity = 0.16 + daylight * 0.64
    this.sideFill.color.setHex(0xc7d9ff).lerp(env.sunColor, daylight * 0.2)
    this.sideFill.intensity = 0.10 + daylight * 0.20
    for (const entry of this.practicals) {
      const intensity = entry.daylightFraction + (1 - entry.daylightFraction) * glow
      entry.light.intensity = entry.baseIntensity * intensity
      entry.light.visible = entry.light.intensity > 0.001
    }
    for (const entry of this.emissives) {
      const intensity = entry.daylightFraction + (1 - entry.daylightFraction) * glow
      entry.material.emissiveIntensity = entry.baseIntensity * intensity
    }
  }

  updateAtmosphere(seconds: number): void {
    this.streetMist.update(seconds)
  }
}
