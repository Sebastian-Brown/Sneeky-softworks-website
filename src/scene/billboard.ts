import * as THREE from 'three'

const VIDEO_URL = `${import.meta.env.BASE_URL}assets/video/billboard-demo.mp4`
const SCREEN_MATERIAL = 'Emission | Billboard video screen'

export function playBillboard(root: THREE.Object3D): void {
  const screens = new Set<THREE.MeshStandardMaterial>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial && material.name === SCREEN_MATERIAL) {
        screens.add(material)
      }
    }
  })
  if (screens.size === 0) return

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.loop = true
  video.src = VIDEO_URL
  video.addEventListener('playing', () => {
    const texture = new THREE.VideoTexture(video)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.flipY = false
    for (const material of screens) {
      material.emissiveMap = texture
      material.needsUpdate = true
    }
  }, { once: true })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) video.pause()
    else void video.play().catch(() => {})
  })

  // Keep the baked poster until playback starts, including when autoplay is blocked.
  video.play().catch((error: unknown) => {
    if (!(error instanceof DOMException) || error.name !== 'NotAllowedError') return
    const retry = () => {
      listeners.abort()
      void video.play().catch(() => {})
    }
    const listeners = new AbortController()
    window.addEventListener('pointerdown', retry, { signal: listeners.signal })
    window.addEventListener('keydown', retry, { signal: listeners.signal })
  })
}
