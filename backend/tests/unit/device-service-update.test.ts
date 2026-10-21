import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deviceService } from '../../../frontend/src/features/devices/device.service';

describe('deviceService.updateDevice', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. includes trimmed name in serialized PATCH request body', async () => {
    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ success: true, device: { id: 'dev-1', ...capturedBody } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await deviceService.updateDevice('dev-1', {
      name: '  Battery Management Systemssss  ',
    });

    expect(capturedBody).toHaveProperty('name', 'Battery Management Systemssss');
    expect(result.name).toBe('Battery Management Systemssss');
  });

  it('2. includes explicit null name in serialized PATCH request body', async () => {
    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ success: true, device: { id: 'dev-1', ...capturedBody } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await deviceService.updateDevice('dev-1', {
      name: null,
    });

    expect(capturedBody).toHaveProperty('name', null);
    expect(result.name).toBeNull();
  });

  it('3. omits name entirely when undefined or omitted in partial update', async () => {
    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ success: true, device: { id: 'dev-1', ...capturedBody } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await deviceService.updateDevice('dev-1', {
      componentId: 'bcms-updated',
    });

    expect(capturedBody).not.toHaveProperty('name');
    expect(capturedBody).toEqual({ componentId: 'bcms-updated' });
    expect(result.componentId).toBe('bcms-updated');
  });

  it('4. preserves serialization behavior when updating name alongside type, componentId, and hardwareId', async () => {
    let capturedBody: any = null;
    let capturedMethod: string | undefined;
    let capturedUrl: string | undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      capturedUrl = url.toString();
      capturedMethod = init?.method;
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ success: true, device: { id: 'dev-1', ...capturedBody } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await deviceService.updateDevice('dev-1', {
      type: 'BMS',
      name: '  Battery Management Systemssss  ',
      componentId: '  bcms  ',
      hardwareId: '  HW-12345  ',
    });

    expect(capturedUrl).toContain('/api/devices/dev-1');
    expect(capturedMethod).toBe('PATCH');
    expect(capturedBody).toEqual({
      type: 'BMS',
      name: 'Battery Management Systemssss',
      componentId: 'bcms',
      hardwareId: 'HW-12345',
    });
    expect(result.name).toBe('Battery Management Systemssss');
    expect(result.componentId).toBe('bcms');
    expect(result.hardwareId).toBe('HW-12345');
    expect(result.type).toBe('BMS');
  });
});
