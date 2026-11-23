const contactForm = document.querySelector<HTMLFormElement>('#contact-form')
const draftButton = contactForm?.querySelector<HTMLButtonElement>('button[type="submit"]')
const messageField = contactForm?.querySelector<HTMLTextAreaElement>('textarea[name="message"]')

messageField?.addEventListener('input', () => {
  if (messageField.value.length > messageField.maxLength) {
    messageField.value = messageField.value.slice(0, messageField.maxLength)
  }
})

contactForm?.addEventListener('submit', (event) => {
  event.preventDefault()
  const form = new FormData(contactForm)
  const name = String(form.get('name') ?? '').trim()
  const email = String(form.get('email') ?? '').trim()
  const message = messageField?.value.slice(0, messageField.maxLength).trim() ?? ''
  const subject = encodeURIComponent('Hello Sneeky Softworks')
  const body = encodeURIComponent(`${message}\r\n\r\nFrom ${name} <${email}>`)
  window.location.href = `mailto:hello@sneekysoftworks.com?subject=${subject}&body=${body}`
})
if (draftButton) draftButton.disabled = false
