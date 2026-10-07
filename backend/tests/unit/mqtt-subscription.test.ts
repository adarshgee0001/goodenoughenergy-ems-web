import { describe, test, expect, vi, beforeEach } from 'vitest';
import { mqttService } from '../../src/services/mqtt.service';
import { prisma } from '../../src/db/prisma';

// Mock prisma and mqtt
vi.mock('../../src/db/prisma', () => ({
  prisma: {
    bESSAsset: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('mqtt', () => {
  return {
    default: {
      connect: vi.fn(() => ({
        on: vi.fn(),
        subscribe: vi.fn(),
        end: vi.fn()
      }))
    }
  };
});

describe('MQTT Phase 2 Subscription Logic', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Inject mock client directly for testing loadTopicsAndSubscribe
    mockClient = {
      subscribe: vi.fn((topics, cb) => {
        if (cb) cb(null);
      }),
      on: vi.fn(),
      end: vi.fn()
    };
    (mqttService as any).client = mockClient;

    // Reset process.env
    delete process.env.MQTT_TOPIC;
  });

  const triggerConnect = async () => {
    await (mqttService as any).loadTopicsAndSubscribe();
  };

  test('Subscribes to single DB topic', async () => {
    (prisma.bESSAsset.findMany as any).mockResolvedValue([
      { mqttTopic: '/gw/test1/user' }
    ]);
    
    await triggerConnect();

    expect(prisma.bESSAsset.findMany).toHaveBeenCalledTimes(1);
    expect(mockClient.subscribe).toHaveBeenCalledWith(['/gw/test1/user'], expect.any(Function));
  });

  test('Subscribes to multiple DB topics', async () => {
    (prisma.bESSAsset.findMany as any).mockResolvedValue([
      { mqttTopic: '/gw/test1/user' },
      { mqttTopic: '/gw/test2/user' }
    ]);
    
    await triggerConnect();

    expect(mockClient.subscribe).toHaveBeenCalledWith(['/gw/test1/user', '/gw/test2/user'], expect.any(Function));
  });

  test('Filters null, empty, and whitespace topics', async () => {
    (prisma.bESSAsset.findMany as any).mockResolvedValue([
      { mqttTopic: '/gw/test1/user' },
      { mqttTopic: null },
      { mqttTopic: '' },
      { mqttTopic: '   ' }
    ]);
    
    await triggerConnect();

    expect(mockClient.subscribe).toHaveBeenCalledWith(['/gw/test1/user'], expect.any(Function));
  });

  test('Existing MQTT_TOPIC fallback is included', async () => {
    process.env.MQTT_TOPIC = '/fallback/+/topic';
    
    (prisma.bESSAsset.findMany as any).mockResolvedValue([
      { mqttTopic: '/gw/test1/user' }
    ]);
    
    await triggerConnect();

    expect(mockClient.subscribe).toHaveBeenCalledWith(['/fallback/+/topic', '/gw/test1/user'], expect.any(Function));
  });

  test('Duplicate topics are deduplicated', async () => {
    process.env.MQTT_TOPIC = '/duplicate/topic';
    
    (prisma.bESSAsset.findMany as any).mockResolvedValue([
      { mqttTopic: '/duplicate/topic' },
      { mqttTopic: ' /duplicate/topic  ' }, // Will trim and deduplicate
      { mqttTopic: '/gw/test1/user' }
    ]);
    
    await triggerConnect();

    expect(mockClient.subscribe).toHaveBeenCalledWith(['/duplicate/topic', '/gw/test1/user'], expect.any(Function));
  });

  test('Fallback used on DB failure', async () => {
    process.env.MQTT_TOPIC = '/fallback/topic';
    
    (prisma.bESSAsset.findMany as any).mockRejectedValue(new Error('DB connection failed'));
    
    await triggerConnect();

    expect(mockClient.subscribe).toHaveBeenCalledWith('/fallback/topic', expect.any(Function));
  });

  test('Does not subscribe if no topics available', async () => {
    (prisma.bESSAsset.findMany as any).mockResolvedValue([]);
    
    await triggerConnect();

    expect(mockClient.subscribe).not.toHaveBeenCalled();
  });
  test('Reconnect triggers topic reload', async () => {
    (prisma.bESSAsset.findMany as any).mockResolvedValue([{ mqttTopic: '/reconnect/topic' }]);
    
    // Reset the service state so connect() actually runs
    (mqttService as any).client = null;
    (mqttService as any).isConnecting = false;
    process.env.MQTT_BROKER_URL = 'mqtt://test';
    process.env.MQTT_USERNAME = 'test';
    process.env.MQTT_PASSWORD = 'test';
    
    mqttService.connect();
    
    // Get the newly created client from the service
    const actualClient = (mqttService as any).client;
    const onCalls = actualClient.on.mock.calls;
    const connectCallback = onCalls.find((c: any) => c[0] === 'connect')?.[1];
    
    expect(connectCallback).toBeDefined();
    await connectCallback();
    
    expect(prisma.bESSAsset.findMany).toHaveBeenCalled();
    // The subscribe function should have been called
    expect(actualClient.subscribe).toHaveBeenCalledWith(['/reconnect/topic'], expect.any(Function));
  });
});
