import QRCode from 'qrcode';

/**
 * 生成访问地址二维码，供 VS Code Webview 展示。
 */
export async function createAccessQrCodeDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
  });
}

/**
 * 生成终端可显示的二维码文本，供 Relay Server CLI 打印。
 */
export async function createAccessQrCodeTerminal(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'terminal',
    small: true,
    errorCorrectionLevel: 'M',
    margin: 1,
  });
}
