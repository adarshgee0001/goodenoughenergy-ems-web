import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AlarmAudioNotifier,
  playAlarmChime,
  resetSharedAudioContextForTesting,
} from '../../../frontend/src/features/settings/alarmAudio.utils';
import {
  validatePreferences,
} from '../../../frontend/src/features/settings/settings.utils';
import {
  DEFAULT_PREFERENCES,
} from '../../../frontend/src/features/settings/settings.types';

// Mock AudioContext class suitable for `new AudioContextClass()`
class MockAudioContext {
  state: string;
  currentTime: number;
  destination: any;
  resume: any;
  createOscillator: any;
  createGain: any;

  static initialState = 'running';
  static shouldResumeSucceed = true;
  static instances: MockAudioContext[] = [];
  static createdOscillators: any[] = [];
  static createdGains: any[] = [];

  constructor() {
    this.state = MockAudioContext.initialState;
    this.currentTime = 100.0;
    this.destination = {};
    this.resume = vi.fn().mockImplementation(async () => {
      if (MockAudioContext.shouldResumeSucceed) {
        this.state = 'running';
      }
    });
    this.createOscillator = vi.fn(() => {
      const osc = {
        type: 'sine',
        frequency: {
          setValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      MockAudioContext.createdOscillators.push(osc);
      return osc;
    });
    this.createGain = vi.fn(() => {
      const gain = {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
      MockAudioContext.createdGains.push(gain);
      return gain;
    });
    MockAudioContext.instances.push(this);
  }

  static reset() {
    MockAudioContext.initialState = 'running';
    MockAudioContext.shouldResumeSucceed = true;
    MockAudioContext.instances = [];
    MockAudioContext.createdOscillators = [];
    MockAudioContext.createdGains = [];
  }
}

describe('Checkpoint 3: Alarm Audio Notification & Admin Preview Context', () => {
  beforeEach(() => {
    resetSharedAudioContextForTesting();
    MockAudioContext.reset();
  });

  afterEach(() => {
    delete (global as any).window;
    resetSharedAudioContextForTesting();
  });

  describe('1. Alarm Audio Preference Defaults, Persistence & Validation', () => {
    it('defaults alarmSoundEnabled to true in DEFAULT_PREFERENCES', () => {
      expect(DEFAULT_PREFERENCES.alarmSoundEnabled).toBe(true);
    });

    it('accepts valid boolean values for alarmSoundEnabled', () => {
      const enabled = validatePreferences({ alarmSoundEnabled: true });
      expect(enabled.alarmSoundEnabled).toBe(true);

      const disabled = validatePreferences({ alarmSoundEnabled: false });
      expect(disabled.alarmSoundEnabled).toBe(false);
    });

    it('falls back to true when alarmSoundEnabled is missing, non-boolean, or malformed', () => {
      expect(validatePreferences({}).alarmSoundEnabled).toBe(true);
      expect(validatePreferences({ alarmSoundEnabled: 'true' as any }).alarmSoundEnabled).toBe(true);
      expect(validatePreferences({ alarmSoundEnabled: 1 as any }).alarmSoundEnabled).toBe(true);
      expect(validatePreferences({ alarmSoundEnabled: null as any }).alarmSoundEnabled).toBe(true);
      expect(validatePreferences({ alarmSoundEnabled: undefined }).alarmSoundEnabled).toBe(true);
      expect(validatePreferences(null).alarmSoundEnabled).toBe(true);
      expect(validatePreferences(undefined).alarmSoundEnabled).toBe(true);
    });

    it('preserves all other preferences when upgrading legacy preferences without alarmSoundEnabled', () => {
      const legacyPrefs = {
        powerUnit: 'MW',
        energyUnit: 'MWh',
        timeFormat: '24h',
        dateFormat: 'DD MMM YYYY',
        timezoneMode: 'browser',
        defaultReportRange: 'Last 30 Days',
      };

      const upgraded = validatePreferences(legacyPrefs);
      expect(upgraded.powerUnit).toBe('MW');
      expect(upgraded.energyUnit).toBe('MWh');
      expect(upgraded.timeFormat).toBe('24h');
      expect(upgraded.dateFormat).toBe('DD MMM YYYY');
      expect(upgraded.timezoneMode).toBe('browser');
      expect(upgraded.defaultReportRange).toBe('Last 30 Days');
      expect(upgraded.alarmSoundEnabled).toBe(true); // Seamlessly upgraded with default ON
    });
  });

  describe('2. Alarm Deduplication, Severity & Status Filtering (AlarmAudioNotifier)', () => {
    let notifier: AlarmAudioNotifier;

    beforeEach(() => {
      (global as any).window = { AudioContext: MockAudioContext };
      notifier = new AlarmAudioNotifier();
      notifier.clear();
    });

    it('suppresses duplicate alarms with the same ID', () => {
      const alarm = { id: 'alm-001', severity: 'CRITICAL', status: 'ACTIVE' };

      // First time: should attempt chime and succeed
      const result1 = notifier.handleIncomingAlarm(alarm, true);
      expect(result1).toBe(true);
      expect(notifier.getSeenCount()).toBe(1);

      // Second time (duplicate broadcast or reconnect): must be suppressed
      const result2 = notifier.handleIncomingAlarm(alarm, true);
      expect(result2).toBe(false);
      expect(notifier.getSeenCount()).toBe(1);

      // Third time (status update to ACKNOWLEDGED): must be suppressed
      const result3 = notifier.handleIncomingAlarm({ ...alarm, status: 'ACKNOWLEDGED' }, true);
      expect(result3).toBe(false);
      expect(notifier.getSeenCount()).toBe(1);
    });

    it('only triggers chime for CRITICAL or FATAL severity', () => {
      // INFO: suppressed
      const infoAlarm = { id: 'alm-info', severity: 'INFO', status: 'ACTIVE' };
      expect(notifier.handleIncomingAlarm(infoAlarm, true)).toBe(false);

      // WARNING: suppressed
      const warnAlarm = { id: 'alm-warn', severity: 'WARNING', status: 'ACTIVE' };
      expect(notifier.handleIncomingAlarm(warnAlarm, true)).toBe(false);

      // CRITICAL: plays
      const critAlarm = { id: 'alm-crit', severity: 'CRITICAL', status: 'ACTIVE' };
      expect(notifier.handleIncomingAlarm(critAlarm, true)).toBe(true);

      // FATAL: plays
      const fatalAlarm = { id: 'alm-fatal', severity: 'FATAL', status: 'ACTIVE' };
      expect(notifier.handleIncomingAlarm(fatalAlarm, true)).toBe(true);
    });

    it('only triggers chime for ACTIVE status', () => {
      // ACKNOWLEDGED: suppressed
      const ackAlarm = { id: 'alm-ack', severity: 'CRITICAL', status: 'ACKNOWLEDGED' };
      expect(notifier.handleIncomingAlarm(ackAlarm, true)).toBe(false);

      // CLEARED: suppressed
      const clrAlarm = { id: 'alm-clr', severity: 'FATAL', status: 'CLEARED' };
      expect(notifier.handleIncomingAlarm(clrAlarm, true)).toBe(false);

      // ACTIVE: plays
      const activeAlarm = { id: 'alm-act', severity: 'CRITICAL', status: 'ACTIVE' };
      expect(notifier.handleIncomingAlarm(activeAlarm, true)).toBe(true);
    });

    it('suppresses audio completely when soundEnabled is false but tracks ID to prevent re-chime', () => {
      const alarm = { id: 'alm-silent-1', severity: 'CRITICAL', status: 'ACTIVE' };

      // When soundEnabled is false: returns false
      const result = notifier.handleIncomingAlarm(alarm, false);
      expect(result).toBe(false);
      expect(notifier.getSeenCount()).toBe(1);

      // If user later turns sound on, the previously observed alarm must NOT replay
      const replayResult = notifier.handleIncomingAlarm(alarm, true);
      expect(replayResult).toBe(false);
    });

    it('safely handles null, undefined, or missing IDs', () => {
      expect(notifier.handleIncomingAlarm(null, true)).toBe(false);
      expect(notifier.handleIncomingAlarm(undefined, true)).toBe(false);
      expect(notifier.handleIncomingAlarm({} as any, true)).toBe(false);
      expect(notifier.handleIncomingAlarm({ id: '' }, true)).toBe(false);
      expect(notifier.getSeenCount()).toBe(0);
    });
  });

  describe('3. Historical Alarm Seeding (seedHistoricalAlarms)', () => {
    let notifier: AlarmAudioNotifier;

    beforeEach(() => {
      (global as any).window = { AudioContext: MockAudioContext };
      notifier = new AlarmAudioNotifier();
      notifier.clear();
    });

    it('seeds pre-existing historical REST alarms so they never chime on initial load', () => {
      const historicalList = [
        { id: 'hist-001', severity: 'CRITICAL', status: 'ACTIVE' },
        { id: 'hist-002', severity: 'FATAL', status: 'ACTIVE' },
        { id: 'hist-003', severity: 'WARNING', status: 'ACTIVE' },
      ];

      notifier.seedHistoricalAlarms(historicalList);
      expect(notifier.getSeenCount()).toBe(3);

      // Incoming WebSocket event for already-seeded historical alarm must return false
      expect(notifier.handleIncomingAlarm(historicalList[0], true)).toBe(false);
      expect(notifier.handleIncomingAlarm(historicalList[1], true)).toBe(false);

      // Unseen incoming alarm should chime normally
      const newAlarm = { id: 'new-live-001', severity: 'CRITICAL', status: 'ACTIVE' };
      expect(notifier.handleIncomingAlarm(newAlarm, true)).toBe(true);
      expect(notifier.getSeenCount()).toBe(4);
    });

    it('gracefully handles empty, null, or malformed arrays in seedHistoricalAlarms', () => {
      expect(() => notifier.seedHistoricalAlarms([])).not.toThrow();
      expect(() => notifier.seedHistoricalAlarms(null as any)).not.toThrow();
      expect(() => notifier.seedHistoricalAlarms(undefined as any)).not.toThrow();
      expect(() => notifier.seedHistoricalAlarms([null as any, { id: '' }, { id: 'valid-1' }])).not.toThrow();
      expect(notifier.getSeenCount()).toBe(1);
    });
  });

  describe('4. Web Audio API Chime Synthesis & Autoplay Restrictions', () => {
    it('returns false safely in non-browser / SSR environment without throwing', () => {
      delete (global as any).window;
      const result = playAlarmChime();
      expect(result).toBe(false);
    });

    it('returns false safely when AudioContext is not supported', () => {
      (global as any).window = {};
      const result = playAlarmChime();
      expect(result).toBe(false);
    });

    it('returns false safely when browser autoplay policy blocks audio (state !== "running")', () => {
      MockAudioContext.initialState = 'suspended';
      MockAudioContext.shouldResumeSucceed = false;
      (global as any).window = { AudioContext: MockAudioContext };

      const result = playAlarmChime();
      expect(result).toBe(false);
    });

    it('synthesizes dual-tone harmonic chime when AudioContext is running', () => {
      MockAudioContext.initialState = 'running';
      (global as any).window = { AudioContext: MockAudioContext };

      const result = playAlarmChime();
      expect(result).toBe(true);
      expect(MockAudioContext.createdOscillators.length).toBe(2);
      expect(MockAudioContext.createdGains.length).toBe(1);

      // Verify oscillators start and stop
      const osc1 = MockAudioContext.createdOscillators[0];
      const osc2 = MockAudioContext.createdOscillators[1];
      expect(osc1.start).toHaveBeenCalled();
      expect(osc1.stop).toHaveBeenCalled();
      expect(osc2.start).toHaveBeenCalled();
      expect(osc2.stop).toHaveBeenCalled();
    });
  });

  describe('5. Admin Preview Context Logic & Identity Disambiguation', () => {
    interface IdentityCardData {
      role: string;
      email: string;
      isPreviewing: boolean;
      clientName?: string;
      siteName?: string;
    }

    function resolveIdentityLabels(data: IdentityCardData) {
      const isSimulating = data.role === 'ADMIN' && data.isPreviewing;
      return {
        accountScope: isSimulating
          ? 'Platform Administration (All Clients)'
          : (data.clientName || 'EMS Client Organization'),
        previewContextActive: isSimulating,
        previewClient: isSimulating ? (data.clientName || 'Selected Client') : null,
        previewSite: isSimulating ? (data.siteName || null) : null,
        sessionStatus: isSimulating
          ? 'Administrator Session (Simulating Client Portal)'
          : 'Verified Corporate Account',
      };
    }

    it('distinguishes admin personal account from previewed client context', () => {
      const adminInPreview = resolveIdentityLabels({
        role: 'ADMIN',
        email: 'admin@goodenoughenergy.com',
        isPreviewing: true,
        clientName: 'Tata Power Microgrid',
        siteName: 'TP-Site-01',
      });

      // Admin identity remains clearly scoped to platform administration
      expect(adminInPreview.accountScope).toBe('Platform Administration (All Clients)');
      expect(adminInPreview.previewContextActive).toBe(true);
      expect(adminInPreview.previewClient).toBe('Tata Power Microgrid');
      expect(adminInPreview.previewSite).toBe('TP-Site-01');
      expect(adminInPreview.sessionStatus).toBe('Administrator Session (Simulating Client Portal)');
    });

    it('renders normal organization assignment for standard client users', () => {
      const standardClient = resolveIdentityLabels({
        role: 'CLIENT',
        email: 'operator@tatapower.com',
        isPreviewing: false,
        clientName: 'Tata Power Microgrid',
        siteName: 'TP-Site-01',
      });

      expect(standardClient.accountScope).toBe('Tata Power Microgrid');
      expect(standardClient.previewContextActive).toBe(false);
      expect(standardClient.previewClient).toBeNull();
      expect(standardClient.previewSite).toBeNull();
      expect(standardClient.sessionStatus).toBe('Verified Corporate Account');
    });

    it('handles admin when NOT previewing (normal admin view)', () => {
      const standardAdmin = resolveIdentityLabels({
        role: 'ADMIN',
        email: 'admin@goodenoughenergy.com',
        isPreviewing: false,
      });

      expect(standardAdmin.accountScope).toBe('EMS Client Organization');
      expect(standardAdmin.previewContextActive).toBe(false);
      expect(standardAdmin.previewClient).toBeNull();
      expect(standardAdmin.sessionStatus).toBe('Verified Corporate Account');
    });
  });
});
