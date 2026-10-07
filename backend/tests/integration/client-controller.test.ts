import { getClient } from '../../src/controllers/client.controller.ts';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

import { describe, test } from 'vitest';

describe('test-client-controller.ts', () => {
  test('Runs all checks', async () => {
  const clients = await prisma.client.findMany();
  if (clients.length === 0) {
    console.log('No clients found in DB, skipping test.');
    return;
  }
  const clientId = clients[0].id;
  console.log('Client ID:', clientId);
  
  const req = { params: { clientId }, user: { id: 'admin', role: 'ADMIN' } };
  let status = 0, json = null;
  const res = {
    status: (code: any) => { status = code; return res; },
    json: (data: any) => { json = data; }
  };
  
  await getClient(req as any, res as any);
  console.log('Controller Result:', status, json);
  });
});
