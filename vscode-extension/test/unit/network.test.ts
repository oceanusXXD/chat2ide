import { describe, expect, it } from 'vitest';

import { describeAccessUrls } from '../../src/utils/network';

describe('network', () => {
  it('当服务绑定具体局域网 IP 时应标记为手机可访问', () => {
    const urls = describeAccessUrls('192.168.10.8', 8765, 'session-1');

    expect(urls.preferredUrl).toBe('http://192.168.10.8:8765/session/session-1');
    expect(urls.phoneReachable).toBe(true);
    expect(urls.lanUrls).toEqual(['http://192.168.10.8:8765/session/session-1']);
  });

  it('当服务仅绑定 localhost 时应提示手机不可访问', () => {
    const urls = describeAccessUrls('127.0.0.1', 8765, 'session-1');

    expect(urls.phoneReachable).toBe(false);
    expect(urls.note).toContain('手机无法直接访问');
  });

  it('配置 publicBaseUrl 后应优先返回公网访问地址', () => {
    const urls = describeAccessUrls(
      '127.0.0.1',
      8765,
      'session-1',
      'https://bridge.example.com/',
    );

    expect(urls.publicUrl).toBe('https://bridge.example.com/session/session-1');
    expect(urls.preferredUrl).toBe('https://bridge.example.com/session/session-1');
    expect(urls.phoneReachable).toBe(true);
    expect(urls.note).toContain('publicBaseUrl');
  });
});
