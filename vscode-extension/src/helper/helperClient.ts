import http from 'http';
import https from 'https';

import { Logger } from '../utils/logger';
import {
  HelperCalibrationResult,
  HelperHealthStatusResponse,
  HelperOkResponse,
  HelperToPluginMessage,
  isHelperErrorResponse,
  PluginToHelperMessage,
} from '../types/protocol';

export interface HelperTransport {
  send(
    path: string,
    method: 'GET' | 'POST',
    payload?: PluginToHelperMessage,
  ): Promise<HelperToPluginMessage>;
}

/**
 * 通过本地 HTTP 与 Python Helper 通信。
 */
export class HttpHelperTransport implements HelperTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async send(
    path: string,
    method: 'GET' | 'POST',
    payload?: PluginToHelperMessage,
  ): Promise<HelperToPluginMessage> {
    const url = new URL(path, this.baseUrl);
    const body = payload ? JSON.stringify(payload) : undefined;
    const client = url.protocol === 'https:' ? https : http;

    return new Promise<HelperToPluginMessage>((resolve, reject) => {
      const request = client.request(
        {
          method,
          hostname: url.hostname,
          port: url.port,
          path: `${url.pathname}${url.search}`,
          timeout: this.timeoutMs,
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
              const text = Buffer.concat(chunks).toString('utf8');
              resolve(JSON.parse(text) as HelperToPluginMessage);
            } catch (error) {
              reject(error);
            }
          });
        },
      );

      request.on('timeout', () => {
        request.destroy(new Error(`请求 Helper 超时：${url.toString()}`));
      });
      request.on('error', reject);

      if (body) {
        request.write(body);
      }
      request.end();
    });
  }
}

/**
 * 收敛 Helper 协议细节，供扩展业务层直接调用。
 */
export class HelperClient {
  constructor(
    private readonly transport: HelperTransport,
    private readonly logger: Logger,
  ) {}

  async healthCheck(requestId = `health-${Date.now()}`): Promise<HelperHealthStatusResponse> {
    this.logger.info('开始执行 Helper 健康检查');
    const response = await this.transport.send('/api/v1/health', 'GET');
    if (isHelperErrorResponse(response)) {
      throw new Error(response.detail);
    }
    if (response.status !== 'health_status') {
      throw new Error(`收到未知的健康检查响应：${JSON.stringify(response)}`);
    }
    if (!response.healthy) {
      throw new Error(response.detail || 'Helper 健康检查未通过');
    }
    return {
      ...response,
      requestId,
    };
  }

  async ping(requestId: string): Promise<HelperOkResponse> {
    this.logger.info('开始执行 Helper ping');
    const response = await this.transport.send('/api/v1/actions', 'POST', {
      action: 'ping',
      requestId,
    });
    if (isHelperErrorResponse(response)) {
      throw new Error(response.detail);
    }
    if (response.status !== 'ok') {
      throw new Error(`收到未知的 Helper ping 响应：${JSON.stringify(response)}`);
    }
    return response;
  }

  async sendPrompt(text: string, requestId: string): Promise<HelperOkResponse> {
    this.logger.info('开始请求 Helper 自动输入 prompt');
    const response = await this.transport.send('/api/v1/actions', 'POST', {
      action: 'send_prompt',
      requestId,
      text,
    });
    if (isHelperErrorResponse(response)) {
      throw new Error(response.detail);
    }
    if (response.status !== 'ok') {
      throw new Error(`收到未知的 Helper send_prompt 响应：${JSON.stringify(response)}`);
    }
    return response;
  }

  async calibrate(requestId: string): Promise<HelperCalibrationResult> {
    this.logger.info('开始请求 Helper 记录输入框校准坐标');
    const response = await this.transport.send('/api/v1/actions', 'POST', {
      action: 'calibrate',
      requestId,
    });
    if (isHelperErrorResponse(response)) {
      throw new Error(response.detail);
    }
    if (response.status !== 'calibration_result') {
      throw new Error(`收到未知的 Helper calibrate 响应：${JSON.stringify(response)}`);
    }
    return response;
  }
}
