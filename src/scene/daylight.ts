import * as THREE from 'three'

/**
 * Pure time-of-day math: minutes since midnight (0..1439) -> environment state.
 * Keyframes are cyclic: the last keyframe wraps back to the first so that
 * 23:xx flows smoothly into 00:xx without a jump.
 */

export interface DayNightKeyframe {
  minutes: number
  background: number
  hemiSky: number
  hemiGround: number
  hemiIntensity: number
  sunDirection: [number, number, number]
  sunColor: number
  sunIntensity: number
  /** 0 = practical/emissive lights fully off, 1 = full night glow. */
  nightFactor: number
}

const DAY_CYCLE_MINUTES = 1440

export const DAY_NIGHT_KEYFRAMES: readonly DayNightKeyframe[] = [
  {
    minutes: 0, // midnight: dark blue moonlit night
    background: 0x05070f,
    hemiSky: 0x1c2a44,
    hemiGround: 0x0a0e18,
    hemiIntensity: 0.35,
    sunDirection: [-0.4, 0.62, 0.25],
    sunColor: 0x8fa8e0,
    sunIntensity: 0.35,
    nightFactor: 1,
  },
  {
    minutes: 330, // 5:30 AM dawn transition
    background: 0xc97b5e,
    hemiSky: 0xf0a878,
    hemiGround: 0x3a2c26,
    hemiIntensity: 0.55,
    sunDirection: [0.92, 0.1, 0.3],
    sunColor: 0xff9d5e,
    sunIntensity: 0.65,
    nightFactor: 0.3,
  },
  {
    minutes: 480, // 8:00 AM full daylight
    background: 0xa8c9e8,
    hemiSky: 0xffeed9,
    hemiGround: 0xae9277,
    hemiIntensity: 1,
    sunDirection: [0.65, 0.62, 0.42],
    sunColor: 0xffd29a,
    sunIntensity: 0.85,
    nightFactor: 0,
  },
  {
    minutes: 720, // noon: higher, slightly oblique light
    background: 0xb3d4ef,
    hemiSky: 0xfff2de,
    hemiGround: 0xb39a80,
    hemiIntensity: 0.94,
    sunDirection: [-0.26, 0.88, 0.41],
    sunColor: 0xffdcad,
    sunIntensity: 0.92,
    nightFactor: 0,
  },
  {
    minutes: 1170, // 5:30 PM warm golden hour
    background: 0xe2a468,
    hemiSky: 0xffcf9e,
    hemiGround: 0x6b5236,
    hemiIntensity: 0.8,
    sunDirection: [-0.85, 0.25, 0.24],
    sunColor: 0xff9e4a,
    sunIntensity: 0.62,
    nightFactor: 0.18,
  },
  {
    minutes: 1200, // 8:00 PM dusk
    background: 0x46365c,
    hemiSky: 0x704d85,
    hemiGround: 0x241f33,
    hemiIntensity: 0.5,
    sunDirection: [-0.95, 0.04, -0.12],
    sunColor: 0xff7a4e,
    sunIntensity: 0.46,
    nightFactor: 0.55,
  },
  {
    minutes: 1260, // 9:00 PM established nighttime default
    background: 0x0a0e1c,
    hemiSky: 0x23304d,
    hemiGround: 0x0b0e16,
    hemiIntensity: 0.42,
    sunDirection: [-0.3, 0.7, -0.2],
    sunColor: 0x8fa5d6,
    sunIntensity: 0.4,
    nightFactor: 1,
  },
]

export interface EnvironmentState {
  background: THREE.Color
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  hemiIntensity: number
  sunDirection: THREE.Vector3
  sunColor: THREE.Color
  sunIntensity: number
  nightFactor: number
  fogStrength: number
}

function smoothstep(u: number): number {
  return u * u * (3 - 2 * u)
}

function nightFogStrength(minutes: number): number {
  const fadeIn = smoothstep(THREE.MathUtils.clamp((minutes - 1185) / 75, 0, 1))
  const fadeOut = smoothstep(THREE.MathUtils.clamp((450 - minutes) / 150, 0, 1))
  return Math.max(fadeIn, fadeOut)
}

/**
 * Sample the environment for a given minute-of-day. Values interpolate
 * smoothly between keyframes; past the last keyframe the segment wraps
 * back to the first keyframe so midnight and 11:59 PM match exactly.
 */
export function sampleEnvironment(minutes: number): EnvironmentState {
  const t = ((minutes % DAY_CYCLE_MINUTES) + DAY_CYCLE_MINUTES) % DAY_CYCLE_MINUTES
  const frames = DAY_NIGHT_KEYFRAMES
  let index = 0
  for (let i = 0; i < frames.length; i++) {
    const next = i + 1 < frames.length ? frames[i + 1].minutes : DAY_CYCLE_MINUTES
    if (t >= frames[i].minutes && t < next) {
      index = i
      break
    }
  }
  const a = frames[index]
  const b = frames[(index + 1) % frames.length]
  const span = (index + 1 === frames.length ? DAY_CYCLE_MINUTES : b.minutes) - a.minutes
  const u = smoothstep((t - a.minutes) / span)

  return {
    background: new THREE.Color(a.background).lerp(new THREE.Color(b.background), u),
    hemiSky: new THREE.Color(a.hemiSky).lerp(new THREE.Color(b.hemiSky), u),
    hemiGround: new THREE.Color(a.hemiGround).lerp(new THREE.Color(b.hemiGround), u),
    hemiIntensity: a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * u,
    sunDirection: new THREE.Vector3(...a.sunDirection).lerp(
      new THREE.Vector3(...b.sunDirection),
      u,
    ).normalize(),
    sunColor: new THREE.Color(a.sunColor).lerp(new THREE.Color(b.sunColor), u),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * u,
    nightFactor: a.nightFactor + (b.nightFactor - a.nightFactor) * u,
    fogStrength: nightFogStrength(t),
  }
}
