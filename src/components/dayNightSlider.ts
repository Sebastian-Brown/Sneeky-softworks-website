// Day/night slider control: a small overlay with a range input driving t (0 = day, 1 = night).

import './day-night-slider.css'

export interface DayNightSliderApi {
  element: HTMLElement
  dispose(): void
}

export function createDayNightSlider(
  initial: number,
  onChange: (t: number) => void,
): DayNightSliderApi {
  const root = document.createElement('div')
  root.className = 'day-night-slider'

  const label = document.createElement('span')
  label.textContent = 'DAY'

  const input = document.createElement('input')
  input.type = 'range'
  input.min = '0'
  input.max = '1'
  input.step = '0.001'
  input.value = String(initial)
  input.setAttribute('aria-label', 'Day to night')

  const labelNight = document.createElement('span')
  labelNight.textContent = 'NIGHT'

  root.append(label, input, labelNight)

  function onInput(): void {
    onChange(parseFloat(input.value))
  }
  input.addEventListener('input', onInput)

  return {
    element: root,
    dispose(): void {
      input.removeEventListener('input', onInput)
      root.remove()
    },
  }
}
