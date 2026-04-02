import { describe, expect, it } from 'vitest';

import { createAccessQrCodeDataUrl } from '../../src/server/qr';

describe('qr', () => {
  it('应生成可用的 data URL', async () => {
    const dataUrl = await createAccessQrCodeDataUrl('http://127.0.0.1:8765/session/demo');
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});
