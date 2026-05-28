import QRCode from 'qrcode'

export async function renderQrCode(container: HTMLElement, text: string, size = 200) {
  container.innerHTML = ''

  const canvas = document.createElement('canvas')
  container.appendChild(canvas)

  await QRCode.toCanvas(canvas, text, {
    margin: 1,
    width: size,
  })
}
