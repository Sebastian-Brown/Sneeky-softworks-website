import './notice.css'

const notice = document.querySelector<HTMLElement>('.games-notice')
let dismissTimer: number | undefined

export function showComingSoon(): void {
  if (!notice) return
  window.clearTimeout(dismissTimer)
  notice.textContent = 'Coming Soon'
  dismissTimer = window.setTimeout(() => { notice.textContent = '' }, 3000)
}

for (const button of document.querySelectorAll('[data-coming-soon]')) {
  button.addEventListener('click', showComingSoon)
}
