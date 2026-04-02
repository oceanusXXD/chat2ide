import http from 'http';

export interface JsonResponse<T> {
  statusCode: number;
  body: T;
}

/**
 * 发送测试用 HTTP JSON 请求，覆盖手机页面与本地服务集成链路。
 */
export function requestJson<T>(
  options: http.RequestOptions,
  payload?: unknown,
): Promise<JsonResponse<T>> {
  const body = payload ? JSON.stringify(payload) : undefined;
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        ...options,
        headers: body
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            }
          : undefined,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on('end', () => {
          try {
            resolve({
              statusCode: response.statusCode ?? 0,
              body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as T,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on('error', reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

export function createFakeClock(initialIso = '2026-03-31T00:00:00.000Z') {
  let now = new Date(initialIso);
  return {
    now: () => new Date(now),
    advanceMs: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

export async function waitForCondition(
  condition: () => boolean,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 1000;
  const intervalMs = options?.intervalMs ?? 20;
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`waitForCondition timeout after ${timeoutMs}ms`);
}
