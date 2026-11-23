import * as THREE from 'three'

const FOLIAGE_NAMES = /\b(?:foliage|ivy|leaves|leaf midribs|pointed leaf|canopy)\b|_leaves\b|potted plant \d+ plant/i
const FOLIAGE_MATERIALS = /\bleaf\s*\||\b(?:foliage|leaves|leaf veins|leaf midribs|pothos|petals?)\b|_leaves\b/i
const RIGID_PLANT_MATERIALS = /planter|potting|soil|ceramic|\bpot\b/i
const HANGING_PLANTER = /^Street Exterior \| (?:Foliage pothos cascading|Hollow ceramic pot$|Recessed soil$|Three suspension cords$)/

export function createStorefrontBreeze(scene: THREE.Scene, model: THREE.Object3D) {
  const wind = { value: 0 }
  const time = { value: 0 }
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const materials = new Map<THREE.Material, THREE.Material>()
  const unbatched = new Set<THREE.Object3D>()
  const lanterns = { left: [] as THREE.Object3D[], right: [] as THREE.Object3D[] }
  const hangingPlanter: THREE.Object3D[] = []
  const bounds = new THREE.Box3()
  const point = new THREE.Vector3()
  model.updateWorldMatrix(true, true)

  model.traverseVisible((object) => {
    const name = String(object.userData.name ?? object.name)
    if (name.startsWith('Ramen Facade Lanterns | ') && /chain|paper lantern shade|ramen lantern/i.test(name)) {
      lanterns[/left/i.test(name) ? 'left' : 'right'].push(object)
      unbatched.add(object)
      return
    }

    if (HANGING_PLANTER.test(name)) hangingPlanter.push(object)
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh ||
        object instanceof THREE.InstancedMesh) return
    const slots = Array.isArray(object.material) ? object.material : [object.material]
    const parentName = String(object.parent?.userData.name ?? object.parent?.name ?? '')
    const plant04 = [name, parentName].some((label) => /potted plant 04 plant/i.test(label))
    const isFoliage = FOLIAGE_NAMES.test(name) || FOLIAGE_NAMES.test(parentName)
    const shouldBend = slots.map((material) => plant04 || FOLIAGE_MATERIALS.test(material.name) ||
      (isFoliage && !RIGID_PLANT_MATERIALS.test(material.name)))
    if (!shouldBend.some(Boolean)) return

    const original = object.geometry
    if (original.hasAttribute('windWeight')) object.geometry = original.clone()
    const geometry = object.geometry
    const position = geometry.getAttribute('position')
    geometry.computeBoundingBox()
    if (!geometry.boundingBox || !position) return
    bounds.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld)
    const height = Math.max(0.06, bounds.max.y - bounds.min.y)
    const amplitude = THREE.MathUtils.clamp(height * 0.10, 0.035, 0.23)
    const weights = new Float32Array(position.count)
    for (let i = 0; i < position.count; i++) {
      const y = point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld).y
      const heightFraction = THREE.MathUtils.clamp((y - bounds.min.y) / height, 0, 1)
      weights[i] = amplitude * Math.sqrt(heightFraction)
    }
    geometry.setAttribute('windWeight', new THREE.BufferAttribute(weights, 1))
    const animated = slots.map((source, index) => {
      if (!shouldBend[index]) return source
      const existing = materials.get(source)
      if (existing) return existing
      const material = source.clone()
      material.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
        shader.uniforms.breezeWind = wind
        shader.uniforms.breezeTime = time
        shader.vertexShader = `
          attribute float windWeight;
          uniform float breezeWind;
          uniform float breezeTime;
        ` + shader.vertexShader.replace('#include <project_vertex>', `
          #include <project_vertex>
          vec3 foliageWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
          float localPhase = dot(foliageWorld.xz, vec2(0.64, 0.43)) + foliageWorld.y * 0.29;
          float flutter = sin(breezeTime * 2.1 + localPhase);
          vec3 offset = windWeight * vec3(0.45 * breezeWind + 0.24 * flutter * abs(breezeWind),
            0.16 * flutter * abs(breezeWind), -0.65 * breezeWind + 0.25 * flutter * abs(breezeWind));
          mvPosition.xyz += mat3(viewMatrix) * offset;
          gl_Position = projectionMatrix * mvPosition;
        `)
      }
      materials.set(source, material)
      return material
    })
    object.material = Array.isArray(object.material) ? animated : animated[0]
  })

  const suspended = [
    ...Object.values(lanterns).map((parts) => ({ parts, attachment: /\| chain/i, name: 'Lantern' })),
    { parts: hangingPlanter, attachment: /suspension cords/i, name: 'Hanging planter' },
  ]
  const pivots = suspended.flatMap(({ parts, attachment, name }) => {
    const chain = parts.find((object) => attachment.test(String(object.userData.name ?? object.name)))
    if (!chain) return []
    bounds.setFromObject(chain)
    if (bounds.isEmpty()) return []
    const pivot = new THREE.Group()
    pivot.name = name + ' breeze pivot'
    bounds.getCenter(pivot.position)
    pivot.position.y = bounds.max.y
    scene.add(pivot)
    for (const part of parts) pivot.attach(part)
    return [pivot]
  })

  return {
    unbatched,
    update(seconds: number) {
      time.value = seconds
      wind.value = motion.matches ? 0 : Math.sin(seconds * 0.37) * 0.66 + Math.sin(seconds * 0.79) * 0.34
      for (const [index, pivot] of pivots.entries()) {
        const sway = motion.matches ? 0 : wind.value * 0.55 + Math.sin(seconds * 0.84 + index * 0.6) * 0.45
        pivot.rotation.set(sway * 0.038, 0, sway * -0.026)
      }
    },
  }
}
