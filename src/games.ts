const notice = document.querySelector<HTMLElement>('.games-notice')

if (notice) {
  let dismissTimer: number | undefined
  for (const button of document.querySelectorAll('[data-coming-soon]')) {
    button.addEventListener('click', () => {
      window.clearTimeout(dismissTimer)
      notice.textContent = 'Coming soon'
      dismissTimer = window.setTimeout(() => { notice.textContent = '' }, 3000)
    })
  }
}
