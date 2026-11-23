/**
 * Lower-left time-of-day control panel: readable 12-hour label, a
 * keyboard-operable range slider (0..1439 minutes), and a day/night icon.
 */

const MINUTES_PER_DAY = 1440
const FALLBACK_MINUTES = 20 * 60 + 30

function wrapMinutes(minutes: number): number {
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

export function formatTimeOfDay(minutes: number): string {
  const m = wrapMinutes(minutes)
  const hour24 = Math.floor(m / 60)
  const minute = String(m % 60).padStart(2, '0')
  const period = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 || 12
  return `${hour12}:${minute} ${period}`
}

function isDaylight(minutes: number): boolean {
  const m = wrapMinutes(minutes)
  return m >= 480 && m < 1170 // 8 AM to 7:30 PM
}

export class TimeOfDayPanel {
  private readonly label: HTMLSpanElement
  private readonly icon: HTMLSpanElement
  private minutes: number

  constructor(container: HTMLElement, onChange: (minutes: number) => void) {
    const startedAt = performance.now()
    const readClock = () => {
      const now = new Date()
      if (Number.isFinite(now.getTime())) return now.getHours() * 60 + now.getMinutes()
      return wrapMinutes(FALLBACK_MINUTES + Math.floor((performance.now() - startedAt) / 60_000))
    }
    this.minutes = readClock()
    let clockOffset = 0
    const panel = document.createElement('div')
    panel.className = 'tod-panel'
    panel.setAttribute('role', 'group')
    panel.setAttribute('aria-label', 'Time of day controls')

    const row = document.createElement('div')
    row.className = 'tod-row'
    this.icon = document.createElement('span')
    this.icon.className = 'tod-icon'
    this.icon.setAttribute('aria-hidden', 'true')
    this.label = document.createElement('span')
    this.label.className = 'tod-label'
    row.append(this.icon, this.label)

    const slider = document.createElement('input')
    slider.type = 'range'
    slider.id = 'time-of-day-slider'
    slider.min = '0'
    slider.max = '1439'
    slider.step = '1'
    slider.setAttribute('aria-label', 'Time of day')

    const renderTime = (minutes: number) => {
      this.minutes = minutes
      const formatted = formatTimeOfDay(minutes)
      slider.value = String(minutes)
      this.label.textContent = formatted
      slider.setAttribute('aria-valuetext', formatted)
      this.icon.textContent = isDaylight(minutes) ? '☀️' : '🌙'
      onChange(minutes)
    }

    slider.addEventListener('input', () => {
      const minutes = Number(slider.value)
      // Keep the preview time the user chose advancing at the same clock rate.
      clockOffset = minutes - readClock()
      renderTime(minutes)
    })

    panel.append(row, slider)
    container.append(panel)

    renderTime(this.minutes)
    const sync = () => {
      const minutes = wrapMinutes(readClock() + clockOffset)
      if (minutes !== this.minutes) renderTime(minutes)
    }
    window.setInterval(sync, 1000)
    document.addEventListener('visibilitychange', sync)
  }

  get currentMinutes(): number {
    return this.minutes
  }
}
