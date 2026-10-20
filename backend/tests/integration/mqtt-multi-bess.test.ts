import { PrismaClient } from '@prisma/client';
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mqttService } from '../../src/services/mqtt.service';

const prisma = new PrismaClient();

describe('MQTT Multi-BESS Support', () => {
  let client1: any;
  let client2: any;
  
  let site1: any;
  let site2: any;
  
  let bess1: any;
  let bess2: any;
  
  let device1: any;
  let device2: any;

  beforeAll(async () => {
    const ts = Date.now();
    client1 = await prisma.client.create({ data: { name: `MQTT Client 1 ${ts}` } });
    client2 = await prisma.client.create({ data: { name: `MQTT Client 2 ${ts}` } });

    site1 = await prisma.site.create({ data: { name: `MQTT Site 1 ${ts}`, clientId: client1.id } });
    site2 = await prisma.site.create({ data: { name: `MQTT Site 2 ${ts}`, clientId: client2.id } });

    bess1 = await prisma.bESSAsset.create({ data: { name: `MQTT BESS 1 ${ts}`, assetIdentifier: `MBESS1-${ts}`, emuId: `EMU-111-${ts}`, siteId: site1.id, mqttTopic: '/mocked/topic1' } });
    bess2 = await prisma.bESSAsset.create({ data: { name: `MQTT BESS 2 ${ts}`, assetIdentifier: `MBESS2-${ts}`, emuId: `EMU-222-${ts}`, siteId: site2.id, mqttTopic: '/mocked/topic2' } });

    device1 = await prisma.device.create({
      data: { type: 'PCS', name: `PCS 1 ${ts}`, componentId: 'pcs', bessAssetId: bess1.id }
    });
    
    device2 = await prisma.device.create({
      data: { type: 'PCS', name: `PCS 2 ${ts}`, componentId: 'pcs', bessAssetId: bess2.id }
    });
  });

  afterAll(async () => {
    // Cleanup safely
    if (device1?.id || device2?.id) {
      await prisma.telemetryHistory.deleteMany({ where: { deviceId: { in: [device1?.id, device2?.id].filter(Boolean) } } });
      await prisma.device.deleteMany({ where: { id: { in: [device1?.id, device2?.id].filter(Boolean) } } });
    }
    if (bess1?.id || bess2?.id) {
      await prisma.bESSAsset.deleteMany({ where: { id: { in: [bess1?.id, bess2?.id].filter(Boolean) } } });
    }
    if (site1?.id || site2?.id) {
      await prisma.site.deleteMany({ where: { id: { in: [site1?.id, site2?.id].filter(Boolean) } } });
    }
    if (client1?.id || client2?.id) {
      await prisma.client.deleteMany({ where: { id: { in: [client1?.id, client2?.id].filter(Boolean) } } });
    }
  });

  test('Processes payloads from multiple distinct BESS devices successfully', async () => {
    const timestamp1 = Math.floor(Date.now() / 1000);
    const timestamp2 = Math.floor(Date.now() / 1000) + 10;
    const ts = (bess1 as any).emuId.split('-')[2]; // get the timestamp back from the emuId we created
    
    // Mock Payload for BESS 1
    const payload1 = {
      sn: `EMU-111-${ts}`,
      code: 'code1',
      pKey: 'pkey1',
      ts: timestamp1,
      devs: [
        {
          dev: 'pcs',
          ts: timestamp1,
          d: [
            { m: 'ai_p', v: 150.5 },
            { m: 'ai_freq', v: 49.97 }
          ]
        }
      ]
    };
    
    // Mock Payload for BESS 2
    const payload2 = {
      sn: `EMU-222-${ts}`,
      code: 'code2',
      pKey: 'pkey2',
      ts: timestamp2,
      devs: [
        {
          dev: 'pcs',
          ts: timestamp2,
          d: [
            { m: 'ai_p', v: 250.5 },
            { m: 'ai_freq', v: 50.02 }
          ]
        }
      ]
    };

    // Simulate incoming MQTT messages
    const topic1 = '/mocked/topic1';
    const topic2 = '/mocked/topic2';
    
    await mqttService.handleMessage(topic1, Buffer.from(JSON.stringify(payload1)));
    await mqttService.handleMessage(topic2, Buffer.from(JSON.stringify(payload2)));
    
    // Verify Telemetry for BESS 1
    const telemetry1 = await prisma.telemetryHistory.findMany({
      where: { deviceId: device1.id }
    });
    
    expect(telemetry1.length).toBe(1);
    expect(telemetry1[0].pcsActivePower).toBe(150.5);
    expect(telemetry1[0].bessFrequency).toBe(49.97);
    expect(telemetry1[0].gridFrequency).toBeNull();

    // Verify Telemetry for BESS 2
    const telemetry2 = await prisma.telemetryHistory.findMany({
      where: { deviceId: device2.id }
    });
    
    expect(telemetry2.length).toBe(1);
    expect(telemetry2[0].pcsActivePower).toBe(250.5);
    expect(telemetry2[0].bessFrequency).toBe(50.02);
    expect(telemetry2[0].gridFrequency).toBeNull();
  });
});
