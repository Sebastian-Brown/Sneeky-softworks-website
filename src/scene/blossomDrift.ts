import * as THREE from 'three'

const CANOPY_NAME = 'Cherry Blossom | Five-petal canopy clusters'
const PETAL_COUNT = 10

export function createBlossomDrift(scene: THREE.Scene, model: THREE.Object3D) {
  let canopy: THREE.Object3D | undefined
  model.traverseVisible((object) => {
    if ((object.userData.name ?? object.name) === CANOPY_NAME) canopy = object
  })
  if (!canopy) return

  const bounds = new THREE.Box3().setFromObject(canopy)
  if (bounds.isEmpty()) return
  const center = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.7)
  shape.quadraticCurveTo(-0.92, -0.15, -0.52, 0.55)
  shape.quadraticCurveTo(-0.32, 0.88, 0, 0.57)
  shape.quadraticCurveTo(0.44, 0.88, 0.61, 0.5)
  shape.quadraticCurveTo(0.86, -0.1, 0, -0.7)
  const geometry = new THREE.ShapeGeometry(shape, 3)
  const material = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    roughness: 0.9,
    emissive: 0xff9cba,
    emissiveIntensity: 0.12,
  })
  const petals = new THREE.InstancedMesh(geometry, material, PETAL_COUNT)
  petals.name = 'Drifting cherry blossom petals'
  petals.frustumCulled = false
  petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  const palette = [0xffbcce, 0xeb8fab, 0xffdfdf, 0xd983a4].map((color) => new THREE.Color(color))
  const particles = Array.from({ length: PETAL_COUNT }, (_, i) => {
    petals.setColorAt(i, palette[i % palette.length])
    return {
      offset: Math.random(),
      duration: 7 + Math.random() * 6,
      phase: Math.random() * Math.PI * 2,
      x: center.x + (Math.random() - 0.6) * Math.min(size.x, 5),
      y: center.y + (Math.random() - 0.48) * Math.min(size.y, 4.5),
      z: center.z + (Math.random() - 0.55) * Math.min(size.z, 7),
      drift: 4 + Math.random() * 7,
      scale: 0.065 + Math.random() * 0.065,
    }
  })
  const transform = new THREE.Object3D()
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  scene.add(petals)

  return (seconds: number) => {
    petals.visible = !motion.matches
    if (!petals.visible) return
    for (const [i, particle] of particles.entries()) {
      const t = (seconds / particle.duration + particle.offset) % 1
      const flutter = t * 8 + particle.phase
      const breeze = Math.sin(seconds * 0.37 + particle.phase) * 0.42
      transform.position.set(
        particle.x - t * 4 + Math.sin(flutter) * 0.35 + breeze,
        THREE.MathUtils.lerp(particle.y, 0.24, t) + Math.cos(flutter) * 0.13,
        particle.z - t * particle.drift,
      )
      transform.rotation.set(flutter * 1.3, flutter * 0.71, flutter)
      const fade = Math.min(1, t * 11, (1 - t) * 10)
      transform.scale.setScalar(particle.scale * fade)
      transform.updateMatrix()
      petals.setMatrixAt(i, transform.matrix)
    }
    petals.instanceMatrix.needsUpdate = true
  }
}
