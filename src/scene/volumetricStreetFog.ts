import * as THREE from 'three'

const VERTEX = `
  varying vec2 screenUV;
  void main() {
    screenUV = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const MARCH = `
  precision highp sampler3D;
  uniform sampler2D sceneDepth;
  uniform sampler3D densityNoise;
  uniform mat4 inverseViewProjection;
  uniform float strength;
  uniform float seconds;
  uniform int steps;
  uniform vec4 lampPositions[3];
  uniform vec4 lampDirections[3];
  uniform vec3 lampColors[3];
  varying vec2 screenUV;

  vec3 worldPoint(float depth) {
    vec4 point = inverseViewProjection * vec4(screenUV * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return point.xyz / point.w;
  }

  void main() {
    vec3 origin = worldPoint(0.0);
    vec3 end = worldPoint(texture2D(sceneDepth, screenUV).r);
    vec3 segment = end - origin;
    float sceneDistance = length(segment);
    vec3 direction = segment / max(sceneDistance, 0.0001);
    vec3 inverseDirection = sign(direction + vec3(0.0000001)) / max(abs(direction), vec3(0.00001));
    vec3 nearPlanes = (vec3(-17.5, -0.08, -23.0) - origin) * inverseDirection;
    vec3 farPlanes = (vec3(3.3, 4.8, 23.0) - origin) * inverseDirection;
    vec3 entry = min(nearPlanes, farPlanes);
    vec3 exit = max(nearPlanes, farPlanes);
    float start = max(0.0, max(entry.x, max(entry.y, entry.z)));
    float endDistance = min(sceneDistance, min(exit.x, min(exit.y, exit.z)));
    if (endDistance <= start) {
      gl_FragColor = vec4(0.0);
      return;
    }

    float stepLength = (endDistance - start) / float(steps);
    // A fixed screen-space offset breaks up sampling bands without flicker or frame history.
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    vec3 scatter = vec3(0.0);
    float transmittance = 1.0;
    for (int i = 0; i < 12; ++i) {
      if (i >= steps) break;
      vec3 point = origin + direction * (start + (float(i) + jitter) * stepLength);
      vec3 noiseUV = point * vec3(0.038, 0.06, 0.037) - seconds * vec3(0.008, 0.0, 0.004);
      float noise = texture(densityNoise, noiseUV).r;
      float pockets = smoothstep(0.39, 0.67, noise);
      float heightFade = exp(-max(0.0, point.y) * 1.04);
      float edge = smoothstep(-17.5, -14.0, point.x) * (1.0 - smoothstep(2.0, 3.3, point.x));
      edge *= 1.0 - smoothstep(19.0, 23.0, abs(point.z));
      float density = strength * edge * heightFade * (0.037 + 0.092 * pockets);
      vec3 light = vec3(0.085, 0.105, 0.145);
      for (int j = 0; j < 3; ++j) {
        vec3 toSample = point - lampPositions[j].xyz;
        float distanceSquared = dot(toSample, toSample);
        float radius = lampPositions[j].w;
        float falloff = max(0.0, 1.0 - distanceSquared / max(radius * radius, 0.001));
        if (falloff <= 0.0) continue;
        float cone = 1.0;
        if (lampDirections[j].w > 0.0) {
          float aim = dot(toSample * inversesqrt(max(distanceSquared, 0.0001)), lampDirections[j].xyz);
          cone = smoothstep(lampDirections[j].w, min(1.0, lampDirections[j].w + 0.115), aim);
        }
        light += lampColors[j] * (falloff * falloff * cone / (1.0 + 0.065 * distanceSquared));
      }
      float opacity = 1.0 - exp(-density * stepLength);
      scatter += transmittance * opacity * light;
      transmittance *= 1.0 - opacity;
    }
    gl_FragColor = vec4(scatter, 1.0 - transmittance);
  }
`

const COMPOSITE = `
  uniform sampler2D sceneColor;
  uniform sampler2D sceneDepth;
  uniform sampler2D fogTexture;
  uniform vec2 fogSize;
  uniform vec2 clipPlanes;
  uniform bool perspective;
  varying vec2 screenUV;

  float distanceFromDepth(vec2 uv) {
    float z = texture2D(sceneDepth, uv).r;
    if (!perspective) return mix(clipPlanes.x, clipPlanes.y, z);
    return clipPlanes.x * clipPlanes.y / mix(clipPlanes.y, clipPlanes.x, z);
  }

  void main() {
    float depth = distanceFromDepth(screenUV);
    vec2 pixel = screenUV * fogSize - 0.5;
    vec2 base = floor(pixel);
    vec2 blend = fract(pixel);
    vec4 accum = vec4(0.0);
    float totalWeight = 0.0;
    for (int y = 0; y < 2; ++y) {
      for (int x = 0; x < 2; ++x) {
        vec2 corner = vec2(float(x), float(y));
        vec2 uv = clamp((base + corner + 0.5) / fogSize, 0.5 / fogSize, 1.0 - 0.5 / fogSize);
        vec2 axisWeight = mix(1.0 - blend, blend, corner);
        float delta = abs(distanceFromDepth(uv) - depth);
        float weight = axisWeight.x * axisWeight.y * exp(-delta * 1.7);
        accum += texture2D(fogTexture, uv) * weight;
        totalWeight += weight;
      }
    }
    vec4 fog = accum / max(totalWeight, 0.0001);
    vec3 surface = texture2D(sceneColor, screenUV).rgb;
    gl_FragColor = vec4(surface * (1.0 - fog.a) + fog.rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function makeNoise(): THREE.Data3DTexture {
  const size = 12
  const values = new Uint8Array(size ** 3)
  let seed = 23819
  for (let i = 0; i < values.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    values[i] = seed >>> 24
  }
  const texture = new THREE.Data3DTexture(values, size, size, size)
  texture.format = THREE.RedFormat
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

export class VolumetricStreetFog {
  private readonly sceneTarget: THREE.WebGLRenderTarget
  private readonly fogTarget: THREE.WebGLRenderTarget
  private readonly fullscreen = new THREE.Scene()
  private readonly screenCamera = new THREE.Camera()
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private readonly bounds = new THREE.Vector2()
  private readonly direction = new THREE.Vector3()
  private readonly position = new THREE.Vector3()
  private readonly march: THREE.ShaderMaterial
  private readonly composite: THREE.ShaderMaterial

  constructor(renderer: THREE.WebGLRenderer) {
    const type = renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType
    const samples = renderer.getContext().getContextAttributes()?.antialias
      ? Math.min(2, renderer.capabilities.maxSamples) : 0
    this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
      type, samples, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    })
    this.fogTarget = new THREE.WebGLRenderTarget(1, 1, {
      type, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    })
    this.march = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: MARCH, depthTest: false, depthWrite: false,
      uniforms: {
        sceneDepth: { value: this.sceneTarget.depthTexture },
        densityNoise: { value: makeNoise() },
        inverseViewProjection: { value: new THREE.Matrix4() },
        strength: { value: 0 }, seconds: { value: 0 }, steps: { value: 12 },
        lampPositions: { value: Array.from({ length: 3 }, () => new THREE.Vector4()) },
        lampDirections: { value: Array.from({ length: 3 }, () => new THREE.Vector4()) },
        lampColors: { value: Array.from({ length: 3 }, () => new THREE.Color(0)) },
      },
    })
    this.composite = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: COMPOSITE, depthTest: false, depthWrite: false,
      uniforms: {
        sceneColor: { value: this.sceneTarget.texture },
        sceneDepth: { value: this.sceneTarget.depthTexture },
        fogTexture: { value: this.fogTarget.texture },
        fogSize: { value: new THREE.Vector2() },
        clipPlanes: { value: new THREE.Vector2() },
        perspective: { value: true },
      },
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.march)
    this.quad.frustumCulled = false
    this.fullscreen.add(this.quad)
  }

  render(
    renderer: THREE.WebGLRenderer, scene: THREE.Scene,
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    strength: number, seconds: number, lowQuality: boolean,
    lights: readonly (THREE.PointLight | THREE.SpotLight)[],
  ): void {
    renderer.getDrawingBufferSize(this.bounds)
    const { x: width, y: height } = this.bounds
    const scale = lowQuality ? 0.25 : 0.5
    const fogWidth = Math.max(1, Math.floor(width * scale))
    const fogHeight = Math.max(1, Math.floor(height * scale))
    this.sceneTarget.setSize(width, height)
    this.fogTarget.setSize(fogWidth, fogHeight)

    renderer.setRenderTarget(this.sceneTarget)
    renderer.render(scene, camera)
    const uniforms = this.march.uniforms
    uniforms.inverseViewProjection.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse)
    uniforms.strength.value = strength
    uniforms.seconds.value = seconds % 3000
    uniforms.steps.value = lowQuality ? 7 : 12
    for (let i = 0; i < 3; i++) {
      const lamp = lights[i]
      const color = uniforms.lampColors.value[i] as THREE.Color
      if (!lamp || !lamp.visible || lamp.intensity <= 0) {
        color.setRGB(0, 0, 0)
        continue
      }
      lamp.getWorldPosition(this.position)
      const spot = lamp instanceof THREE.SpotLight
      const range = spot ? 8 : 5.5
      uniforms.lampPositions.value[i].set(this.position.x, this.position.y, this.position.z, range)
      if (spot) lamp.target.getWorldPosition(this.direction).sub(this.position).normalize()
      else this.direction.set(0, 0, 0)
      uniforms.lampDirections.value[i].set(this.direction.x, this.direction.y, this.direction.z,
        spot ? Math.cos(Math.min(lamp.angle + 0.10, 1.3)) : 0)
      color.copy(lamp.color).multiplyScalar(spot
        ? Math.min(1.9, lamp.intensity * 0.12)
        : Math.min(0.9, lamp.intensity * 0.19))
    }
    this.quad.material = this.march
    renderer.setRenderTarget(this.fogTarget)
    renderer.render(this.fullscreen, this.screenCamera)

    this.composite.uniforms.fogSize.value.set(fogWidth, fogHeight)
    this.composite.uniforms.clipPlanes.value.set(camera.near, camera.far)
    this.composite.uniforms.perspective.value = camera instanceof THREE.PerspectiveCamera
    this.quad.material = this.composite
    renderer.setRenderTarget(null)
    renderer.render(this.fullscreen, this.screenCamera)
  }
}
