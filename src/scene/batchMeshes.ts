import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** Combine nearby opaque static meshes so they share a draw call. */
export function batchStaticMeshes(root: THREE.Object3D, interactive: ReadonlySet<THREE.Object3D>): void {
  root.updateWorldMatrix(true, true)
  const worldToRoot = root.matrixWorld.clone().invert()
  const groups = new Map<string, THREE.Mesh[]>()
  const center = new THREE.Vector3()

  root.traverseVisible((object) => {
    if (interactive.has(object) || !(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh ||
        object instanceof THREE.InstancedMesh || object.children.length) return
    const geometry: THREE.BufferGeometry = object.geometry
    const { material } = object
    if (Array.isArray(material) || material.transparent || material.alphaTest > 0 ||
        (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0) ||
        Object.keys(geometry.morphAttributes).length || object.matrixWorld.determinant() < 0) return

    geometry.computeBoundingBox()
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return
    geometry.boundingBox.getCenter(center).applyMatrix4(object.matrixWorld)
    const cell = center.toArray().map((value) => Math.floor(value / 6)).join(',')
    const attributes = Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b))
      .map(([name, attr]) => `${name}:${attr.itemSize}:${attr.array.constructor.name}:${attr.normalized}`)
      .join(',')
    const key = `${material.uuid}/${cell}/${attributes}/${!!geometry.index}/${object.castShadow}/${object.receiveShadow}/${object.renderOrder}`
    const group = groups.get(key)
    if (group) group.push(object)
    else groups.set(key, [object])
  })

  const transform = new THREE.Matrix4()
  for (const group of groups.values()) {
    if (group.length < 3) continue
    const parts = group.map((mesh) => {
      transform.multiplyMatrices(worldToRoot, mesh.matrixWorld)
      return mesh.geometry.clone().applyMatrix4(transform)
    })
    const geometry = mergeGeometries(parts)
    for (const part of parts) part.dispose()
    if (!geometry) continue

    const first = group[0]
    const batch = new THREE.Mesh(geometry, first.material)
    batch.name = 'Static storefront geometry'
    batch.castShadow = first.castShadow
    batch.receiveShadow = first.receiveShadow
    batch.renderOrder = first.renderOrder
    root.add(batch)
    for (const mesh of group) mesh.removeFromParent()
  }
}
