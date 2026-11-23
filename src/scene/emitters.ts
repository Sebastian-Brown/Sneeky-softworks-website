import * as THREE from 'three'

/**
 * Practical (real Three.js) lights attached to emissive scene objects, plus
 * detection of emissive materials so their glow can be driven by time.
 */

export interface PracticalLightSpec {
  /** Human-readable label for reporting unmatched specs. */
  name: string
  /** Exact GLB node names this spec may attach to (first match wins). */
  matchNames: readonly string[]
  kind: 'point' | 'spot'
  color: number
  /** Base intensity at full night (nightFactor = 1); scaled down by day. */
  intensity: number
  distance: number
  decay?: number
  angle?: number
  penumbra?: number
  castShadow?: boolean
}

/**
 * Intentional, limited set of practical lights for the important visible
 * emitters in the Storefront scene:
 * red lanterns, shop sign / light boxes, vending machine, warm interior
 * fixtures. One light per spec — never one per emissive mesh.
 */
export const PRACTICAL_LIGHT_SPECS: readonly PracticalLightSpec[] = [
  {
    name: 'Red lantern (left)',
    matchNames: ['Ramen Facade Lanterns | Left Paper Lantern Shade', 'Ramen_Lantern_Left'],
    kind: 'point',
    color: 0xff713b,
    intensity: 6,
    distance: 3.4,
    decay: 2,
    castShadow: true,
  },
  {
    name: 'Red lantern (right)',
    matchNames: ['Ramen Facade Lanterns | Right Paper Lantern Shade', 'Ramen_Lantern_Right'],
    kind: 'point',
    color: 0xff713b,
    intensity: 6,
    distance: 3.4,
    decay: 2,
    castShadow: true,
  },
  {
    name: 'Ramen banner light box',
    matchNames: ['Ramen Vertical Banner | Emissive Panel', 'EventLight_ramen_banner mesh'],
    kind: 'spot',
    color: 0xff6460,
    intensity: 7,
    distance: 3.5,
    angle: 1.05,
    penumbra: 0.45,
  },
  {
    name: 'Middle office overhead fixture',
    matchNames: ['Storefront Building | Emissive Fixture 05'],
    kind: 'point',
    color: 0xffdcad,
    intensity: 4,
    distance: 3,
  },
  {
    name: 'Vending machine',
    matchNames: ['Street Exterior | Vending Machine Light Anchor', 'vendingMachine'],
    kind: 'point',
    color: 0xcfe4ff,
    intensity: 6,
    distance: 2.6,
    decay: 2,
  },
  {
    name: 'Desk lamp A (interior fixture)',
    matchNames: ['Left Office Desk Lamp | Emissive Diffuser', 'Lamp | diffuser'],
    kind: 'point',
    color: 0xffb35c,
    intensity: 3.5,
    distance: 1.8,
    decay: 2,
  },
  {
    name: 'Desk lamp B (interior fixture)',
    matchNames: ['Middle Office Desk Lamp | Emissive Diffuser', 'Lamp | diffuser.001'],
    kind: 'point',
    color: 0xffb35c,
    intensity: 3.5,
    distance: 1.8,
    decay: 2,
  },
]

export interface PracticalLight {
  object: THREE.Object3D
  light: THREE.Light
}

export interface UnmatchedSpec {
  name: string
  matchNames: readonly string[]
}

function buildLight(spec: PracticalLightSpec): THREE.PointLight | THREE.SpotLight {
  const common = { distance: spec.distance, decay: spec.decay ?? 2 }
  if (spec.kind === 'spot') {
    const light = new THREE.SpotLight(
      spec.color,
      spec.intensity,
      spec.distance,
      spec.angle ?? Math.PI / 4,
      spec.penumbra ?? 0.5,
    )
    Object.assign(light, common)
    return light
  }
  const light = new THREE.PointLight(spec.color, spec.intensity, spec.distance)
  light.decay = common.decay
  if (spec.castShadow) {
    light.castShadow = true
    light.shadow.mapSize.set(512, 512)
    light.shadow.bias = -0.004
  }
  return light
}

/**
 * Find the important emissive objects by their GLB names and attach one real
 * Three.js light to each as a child, so the light follows the object's
 * transform. Returns created lights and any specs that could not be matched.
 * Objects are tagged so a model reload cannot create duplicate lights.
 */
export function findPracticalLights(
  root: THREE.Object3D,
): { lights: PracticalLight[]; unmatched: UnmatchedSpec[] } {
  const byName = new Map<string, THREE.Object3D>()
  root.traverse((node) => {
    const exportedName = node.userData.name
    if (typeof exportedName === 'string' && !byName.has(exportedName)) {
      byName.set(exportedName, node)
    }
    if (node.name && !byName.has(node.name)) byName.set(node.name, node)
  })

  const lights: PracticalLight[] = []
  const unmatched: UnmatchedSpec[] = []
  for (const spec of PRACTICAL_LIGHT_SPECS) {
    let object: THREE.Object3D | undefined
    for (const name of spec.matchNames) {
      const candidate = byName.get(name)
      if (candidate && !candidate.userData.__practicalLightAttached) {
        object = candidate
        break
      }
    }
    if (!object) {
      unmatched.push({ name: spec.name, matchNames: spec.matchNames })
      continue
    }
    const light = buildLight(spec)
    light.name = `Practical_${spec.name}`
    object.add(light)
    object.userData.__practicalLightAttached = true
    lights.push({ object, light })
  }
  return { lights, unmatched }
}

export interface EmissiveMaterialEntry {
  material: THREE.MeshStandardMaterial
  baseIntensity: number
  daylightFraction: number
}

const DAYLIT_EMITTERS = new Set([
  'Emission | Navigation buttons shared graphics',
  'Emission | Sneeky Softworks logo',
  'Emission | Sneeky Softworks shortened sign',
  'Emission | Vertical ramen banner',
  'Emission | Vertical ramen banner artwork',
  'Emission | Good Games Good People standing sign',
  'Emission | Ramen paper lantern left',
  'Emission | Ramen paper lantern right',
  'Emission | Vending machine opal strips',
  'Emission | Ramen roof sign bulbs',
  'Emission | Billboard video screen',
  'Emission | Right facade lettering',
])

/**
 * Collect every standard material with a non-black emissive term under the
 * model root so its emissiveIntensity can be driven from the time state.
 */
export function collectEmissiveMaterials(root: THREE.Object3D): EmissiveMaterialEntry[] {
  const seen = new Map<THREE.Material, EmissiveMaterialEntry>()
  const facadeMaterials = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>()
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    for (let slot = 0; slot < materials.length; slot++) {
      const source = materials[slot]
      if (!(source instanceof THREE.MeshStandardMaterial)) continue
      let material = source
      const sign = [node, node.parent].some((object) =>
        String(object?.userData.name ?? object?.name ?? '').startsWith('Right Facade Signs | '),
      )
      if (sign && source.name === 'Warm white lettering') {
        const existing = facadeMaterials.get(source)
        material = existing ?? source.clone()
        if (!existing) {
          material.name = 'Emission | Right facade lettering'
          material.emissive.setHex(0xffedda)
          material.emissiveIntensity = 0.48
          facadeMaterials.set(source, material)
        }
        if (Array.isArray(node.material)) materials[slot] = material
        else node.material = material
      }
      if (seen.has(material)) continue
      const e = material.emissive
      if (!material.emissiveMap && (!e || e.r <= 0.01 && e.g <= 0.01 && e.b <= 0.01)) continue
      const daylit = material.name.startsWith('Emission | Right navigation ') ||
        material.name.startsWith('Emission | Building fixture ') ||
        material.name.includes('ceiling fixture') || DAYLIT_EMITTERS.has(material.name)
      seen.set(material, {
        material,
        baseIntensity: material.emissiveIntensity,
        daylightFraction: daylit ? 0.34 : 0.05,
      })
    }
  })
  return [...seen.values()]
}
