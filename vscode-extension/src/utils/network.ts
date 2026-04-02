import os from 'os';

export interface AccessUrlSet {
  localUrl: string;
  lanUrls: string[];
  preferredUrl: string;
  publicUrl?: string;
  phoneReachable: boolean;
  note?: string;
}

export interface AccessFieldDescriptor {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
}

/**
 * 只返回常见私网 IPv4 地址，减少把无关网卡地址暴露给用户。
 */
export function findLanIpv4Addresses(): string[] {
  const interfaces = os.networkInterfaces();
  const result = new Set<string>();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) {
        continue;
      }
      if (/^(10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/.test(entry.address)) {
        result.add(entry.address);
      }
    }
  }

  return Array.from(result).sort();
}

/**
 * 根据监听地址和 sessionId 生成本机与局域网访问地址。
 */
export function describeAccessUrls(
  host: string,
  port: number,
  sessionId: string,
  publicBaseUrl?: string,
): AccessUrlSet {
  const path = `/session/${sessionId}`;
  const publicUrl = buildPublicSessionUrl(publicBaseUrl, sessionId);

  const preferPublicUrl = (urls: AccessUrlSet): AccessUrlSet => {
    if (!publicUrl) {
      return urls;
    }
    return {
      ...urls,
      preferredUrl: publicUrl,
      publicUrl,
      phoneReachable: true,
      note: '已配置 publicBaseUrl，手机应优先使用该地址访问。',
    };
  };

  if (host === '0.0.0.0') {
    const localUrl = `http://127.0.0.1:${port}${path}`;
    const lanUrls = findLanIpv4Addresses().map((address) => `http://${address}:${port}${path}`);
    return preferPublicUrl({
      localUrl,
      lanUrls,
      preferredUrl: lanUrls[0] ?? localUrl,
      phoneReachable: lanUrls.length > 0,
      note:
        lanUrls.length > 0
          ? undefined
          : '未检测到可靠的局域网地址，将继续提供 localhost 地址。',
    });
  }

  const directUrl = `http://${host}:${port}${path}`;
  if (isLoopbackHost(host)) {
    return preferPublicUrl({
      localUrl: directUrl,
      lanUrls: [],
      preferredUrl: directUrl,
      phoneReachable: false,
      note: '当前服务仅绑定回环地址，手机无法直接访问。若需局域网访问，请把 promptBridge.server.host 改为 0.0.0.0 或具体局域网 IP。',
    });
  }

  if (isPrivateIpv4(host)) {
    return preferPublicUrl({
      localUrl: directUrl,
      lanUrls: [directUrl],
      preferredUrl: directUrl,
      phoneReachable: true,
      note: '当前服务已绑定到具体局域网地址，可直接让手机访问该地址。',
    });
  }

  return preferPublicUrl({
    localUrl: directUrl,
    lanUrls: [directUrl],
    preferredUrl: directUrl,
    phoneReachable: true,
    note: '当前服务绑定到指定地址，请确认手机和桌面处于可互通网络，或改为 0.0.0.0 以自动发现局域网地址。',
  });
}

export function buildPublicSessionUrl(
  publicBaseUrl: string | undefined,
  sessionId: string,
): string | undefined {
  if (!publicBaseUrl) {
    return undefined;
  }
  const normalized = publicBaseUrl.replace(/\/+$/, '');
  return `${normalized}/session/${sessionId}`;
}

export function describeAccessFields(urls: AccessUrlSet): AccessFieldDescriptor[] {
  const fields: AccessFieldDescriptor[] = [];
  const seen = new Set<string>();

  const pushField = (
    label: string,
    value: string | undefined,
    tone: AccessFieldDescriptor['tone'] = 'default',
  ) => {
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    fields.push({ label, value, tone });
  };

  pushField('推荐访问链接', urls.preferredUrl, urls.publicUrl ? 'success' : 'default');
  pushField('公网地址', urls.publicUrl, 'success');
  pushField('本机地址', urls.localUrl);
  for (const [index, value] of urls.lanUrls.entries()) {
    pushField(`局域网地址 ${index + 1}`, value);
  }

  return fields;
}

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function isPrivateIpv4(host: string): boolean {
  return /^(10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/.test(host);
}
