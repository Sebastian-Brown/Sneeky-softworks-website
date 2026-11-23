import * as THREE from 'three'

// Four time slices of the original pocket noise, packed into one tile.
// X wraps as the fog drifts. Y uses ten rows for lattice coordinates 0–9.
const NOISE_WIDTH = 16
const NOISE_ROWS = 10
const NOISE_SLICES = 4

function makePocketNoise(): THREE.DataTexture {
  const height = NOISE_ROWS * NOISE_SLICES
  const data = new Uint8Array(NOISE_WIDTH * height)
  const fract = (value: number) => value - Math.floor(value)
  for (let row = 0; row < height; row++) {
    const y = fract((row % NOISE_ROWS) * 0.1031)
    const z = fract(Math.floor(row / NOISE_ROWS) * 0.1031)
    for (let column = 0; column < NOISE_WIDTH; column++) {
      const x = fract(column * 0.1031)
      const hash = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33)
      data[row * NOISE_WIDTH + column] = Math.round(fract((x + y + 2 * hash) * (z + hash)) * 255)
    }
  }
  const texture = new THREE.DataTexture(data, NOISE_WIDTH, height, THREE.RedFormat)
  texture.wrapS = THREE.RepeatWrapping
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

/** Low mist sampled on depth-tested layers so props can sit inside the haze. */
export class StreetMist {
  private readonly layers = new THREE.Group()
  private readonly density = { value: 0 }
  private readonly phase = { value: 0 }

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.PlaneGeometry(28, 46)
    const noise = { value: makePocketNoise() }
    this.layers.name = 'Nighttime street mist'
    this.layers.visible = false

    for (let layer = 0; layer < 6; layer++) {
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          density: this.density,
          noise,
          drift: this.phase,
          layerWeight: { value: 1 - layer / 8 },
          layerOffset: { value: layer * 0.32 },
          mistColor: { value: new THREE.Color(0x8295af) },
        },
        vertexShader: `
          varying vec2 mistUV;
          void main() {
            mistUV = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float density;
          uniform sampler2D noise;
          uniform float drift;
          uniform float layerWeight;
          uniform float layerOffset;
          uniform vec3 mistColor;
          varying vec2 mistUV;

          float sampleSlice(vec2 cell, float slice) {
            vec2 texel = cell + vec2(0.5, mod(slice, ${NOISE_SLICES}.0) * ${NOISE_ROWS}.0 + 0.5);
            return texture2D(noise, texel / vec2(${NOISE_WIDTH}.0, ${NOISE_ROWS * NOISE_SLICES}.0)).r;
          }

          float pocketNoise(vec3 point) {
            vec3 c = floor(point);
            vec3 u = fract(point);
            u = u * u * (3.0 - 2.0 * u);
            vec2 cell = c.xy + u.xy;
            return mix(sampleSlice(cell, c.z), sampleSlice(cell, c.z + 1.0), u.z);
          }

          void main() {
            vec2 p = mistUV;
            vec2 edge = smoothstep(vec2(0.0), vec2(0.24, 0.16), min(p, 1.0 - p));
            float noiseValue = pocketNoise(vec3(p.x * 8.0 - drift * 16.0, p.y * 9.0, layerOffset * 0.35 + drift * 4.0));
            float pockets = smoothstep(0.58, 0.88, noiseValue);
            float coverage = 0.36 + 0.84 * pockets;
            gl_FragColor = vec4(mistColor, density * layerWeight * edge.x * edge.y * coverage);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      })
      const sheet = new THREE.Mesh(geometry, material)
      sheet.rotation.x = -Math.PI / 2
      sheet.position.set(-3.5, 0.33 + layer * 0.24, 0)
      this.layers.add(sheet)
    }
    scene.add(this.layers)
  }

  setStrength(strength: number): void {
    this.layers.visible = strength > 0
    this.density.value = 0.14 * strength
  }

  update(seconds: number): void {
    if (this.layers.visible) this.phase.value = (seconds % 135) / 135
  }
}
