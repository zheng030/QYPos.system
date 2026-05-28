export function moveSegmentHighlighter(index: number) {
  const highlighter = document.getElementById('reportHighlighter')
  const options = document.querySelectorAll('.segment-control-container .segment-option')
  options.forEach((option) => {
    option.classList.remove('active')
  })
  if (options[index]) options[index].classList.add('active')
  if (highlighter) highlighter.style.transform = `translateX(${index * 100}%)`
}

export function toggleDetail(id: string) {
  const element = document.getElementById(id)
  if (!element) return
  element.style.display = element.style.display === 'none' ? 'block' : 'none'
}

export function toggleAccordion(id: string) {
  const element = document.getElementById(id)
  if (!element) return
  const button = element.previousElementSibling as HTMLElement | null
  element.classList.toggle('show')
  if (button) button.classList.toggle('active')
}
