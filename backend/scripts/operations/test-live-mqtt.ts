import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';



if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL?.includes("ems?schema")) {
  throw new Error("This script cannot run against a production environment.");
}

dotenv.config();

const prisma = new PrismaClient();

import { mqttService } from '../../src/services/mqtt.service';

const runLiveTest = async () => {
  console.log('Setting up temporary Device mapping for testing (sn=2412131092, dev=bcms)...');
  
  // First ensure there's a client, site, bess
  let testClient = await prisma.client.findUnique({ where: { name: 'LiveTestClient' } });
  if (!testClient) {
     testClient = await prisma.client.create({ data: { name: 'LiveTestClient' } });
  }
  
  let testSite = await prisma.site.findFirst({ where: { clientId: testClient.id, name: 'LiveTestSite' } });
  if (!testSite) {
     testSite = await prisma.site.create({ data: { name: 'LiveTestSite', clientId: testClient.id } });
  }
  
  let testBess = await prisma.bESSAsset.findFirst({ where: { siteId: testSite.id, name: 'LiveTestBess' } });
  if (!testBess) {
     testBess = await prisma.bESSAsset.create({ data: { name: 'LiveTestBess', assetIdentifier: 'LiveTestAssetId1', siteId: testSite.id } });
  }
  
  const tempDevice = await prisma.device.upsert({
    where: { emuId_componentId: { emuId: '2412131092', componentId: 'bcms' } },
    update: {},
    create: {
      type: 'BMS',
      name: 'Test Device',
      emuId: '2412131092',
      componentId: 'bcms',
      bessAssetId: testBess.id
    }
  });

  console.log(`[Test Setup] Temporary Device Created: ${tempDevice.id}`);
  console.log('Starting Real HiveMQ Connection Test...');

  const url = process.env.MQTT_BROKER_URL;
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;
  const topic = process.env.MQTT_TOPIC;

  if (!url || !username || !password || !topic) {
    console.error('❌ FAIL: Real HiveMQ test cannot run. Missing required credentials in .env');
    console.log('\nPlease ensure the following are populated in your .env file:');
    console.log('MQTT_BROKER_URL, MQTT_USERNAME, MQTT_PASSWORD, MQTT_TOPIC');
    process.exit(1);
  }

  console.log(`Connecting to ${url}...`);
  mqttService.connect();

  console.log('Waiting up to 15 seconds for a telemetry message...');
  
  // Wait a bit to observe logs and potentially receive a message
  await new Promise(resolve => setTimeout(resolve, 15000));
  
  console.log('\nTest window complete. Disconnecting...');
  mqttService.disconnect();

  console.log('Cleaning up temporary Device data...');
  await prisma.device.delete({ where: { id: tempDevice.id } });
  await prisma.bESSAsset.delete({ where: { id: testBess.id } });
  await prisma.site.delete({ where: { id: testSite.id } });
  await prisma.client.delete({ where: { id: testClient.id } });
  console.log('Cleanup complete.');
  
  process.exit(0);
};

runLiveTest().catch(console.error);
