import { describe, expect, it } from 'vitest';

import { HelperClient, HelperTransport } from '../../src/helper/helperClient';
import { MemoryLogger } from '../../src/utils/logger';

describe('HelperClient', () => {
  it('应在健康检查成功时返回结果', async () => {
    const transport: HelperTransport = {
      send: async () => ({
        status: 'health_status',
        requestId: 'health',
        healthy: true,
        platform: 'linux',
        version: '0.2.0',
        detail: 'ok',
        state: 'idle',
      }),
    };
    const client = new HelperClient(transport, new MemoryLogger());
    const result = await client.healthCheck('health-1');
    expect(result.status).toBe('health_status');
    expect(result.platform).toBe('linux');
  });

  it('应在健康检查返回 unhealthy 时抛出异常', async () => {
    const transport: HelperTransport = {
      send: async () => ({
        status: 'health_status',
        requestId: 'health',
        healthy: false,
        platform: 'linux',
        version: '0.2.0',
        detail: '依赖缺失',
        state: 'failure',
      }),
    };
    const client = new HelperClient(transport, new MemoryLogger());
    await expect(client.healthCheck('health-2')).rejects.toThrowError('依赖缺失');
  });

  it('应支持校准调用', async () => {
    const transport: HelperTransport = {
      send: async () => ({
        status: 'calibration_result',
        requestId: 'cal-1',
        detail: '已记录坐标',
        x: 10,
        y: 20,
        state: 'success',
      }),
    };
    const client = new HelperClient(transport, new MemoryLogger());
    const result = await client.calibrate('cal-1');
    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
  });

  it('应在 Helper 返回错误时抛出异常', async () => {
    const transport: HelperTransport = {
      send: async () => ({
        status: 'error',
        code: 'AUTOMATION_FAILED',
        detail: '发送失败',
      }),
    };
    const client = new HelperClient(transport, new MemoryLogger());
    await expect(client.sendPrompt('hello', 'req-1')).rejects.toThrowError('发送失败');
  });
});
