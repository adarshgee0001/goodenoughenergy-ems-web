import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AlarmAudioNotifier,
  playAlarmSound,
  playAlarmChime,
  resetSharedAudioContextForTesting,
  SOUND_PROFILES,
  VALID_SOUND_PROFILES,
} from '../../../frontend/src/features/settings/alarmAudio.utils';
import {
  validatePreferences,
} from '../../../frontend/src/features/settings/settings.utils';
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
  type AlarmSoundProfileId,
} from '../../../frontend/src/features/settings/settings.types';

// Mock AudioContext class suitable for testing Web Audio API synthesis
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
          exponentialRampToValueAtTime: vi.fn(),
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
          linearRampToValueAtTime: vi.fn(),
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

describe('Checkpoint 4: Configurable Alarm Sound Profiles', () => {
  beforeEach(() => {
    resetSharedAudioContextForTesting();
    MockAudioContext.reset();
  });

  afterEach(() => {
    delete (global as any).window;
    resetSharedAudioContextForTesting();
  });

  describe('1. Profile Metadata & Validation', () => {
    it('defines exactly 4 curated sound profiles in SOUND_PROFILES', () => {
      expect(SOUND_PROFILES.length).toBe(4);
      const ids = SOUND_PROFILES.map((p) => p.id);
      expect(ids).toContain('classic-double-beep');
      expect(ids).toContain('soft-chime');
      expect(ids).toContain('urgent-pulse');
      expect(ids).toContain('high-low-alert');
    });

    it('defaults alarmSoundProfile to "classic-double-beep" in DEFAULT_PREFERENCES', () => {
      expect(DEFAULT_PREFERENCES.alarmSoundProfile).toBe('classic-double-beep');
    });

    it('accepts all valid profile IDs in validatePreferences', () => {
      for (const id of VALID_SOUND_PROFILES) {
        const validated = validatePreferences({ alarmSoundProfile: id });
        expect(validated.alarmSoundProfile).toBe(id);
      }
    });

    it('falls back to "classic-double-beep" for invalid, unknown, or malformed profile IDs', () => {
      expect(validatePreferences({}).alarmSoundProfile).toBe('classic-double-beep');
      expect(validatePreferences({ alarmSoundProfile: 'unknown-tune' as any }).alarmSoundProfile).toBe('classic-double-beep');
      expect(validatePreferences({ alarmSoundProfile: 123 as any }).alarmSoundProfile).toBe('classic-double-beep');
      expect(validatePreferences({ alarmSoundProfile: null as any }).alarmSoundProfile).toBe('classic-double-beep');
      expect(validatePreferences({ alarmSoundProfile: '' as any }).alarmSoundProfile).toBe('classic-double-beep');
      expect(validatePreferences(null).alarmSoundProfile).toBe('classic-double-beep');
      expect(validatePreferences(undefined).alarmSoundProfile).toBe('classic-double-beep');
    });

    it('preserves all other preferences when upgrading legacy records missing alarmSoundProfile', () => {
      const legacy = {
        powerUnit: 'MW',
        energyUnit: 'MWh',
        timeFormat: '24h',
        dateFormat: 'YYYY-MM-DD',
        timezoneMode: 'browser',
        defaultReportRange: 'Last 7 Days',
        alarmSoundEnabled: true,
      };

      const upgraded = validatePreferences(legacy);
      expect(upgraded.powerUnit).toBe('MW');
      expect(upgraded.energyUnit).toBe('MWh');
      expect(upgraded.timeFormat).toBe('24h');
      expect(upgraded.dateFormat).toBe('YYYY-MM-DD');
      expect(upgraded.timezoneMode).toBe('browser');
      expect(upgraded.defaultReportRange).toBe('Last 7 Days');
      expect(upgraded.alarmSoundEnabled).toBe(true);
      expect(upgraded.alarmSoundProfile).toBe('classic-double-beep'); // Seamlessly upgraded
    });
  });

  describe('2. Acoustic Profile Synthesis & Natural Durations (No unconditional 350ms cap)', () => {
    beforeEach(() => {
      (global as any).window = { AudioContext: MockAudioContext };
    });

    it('synthesizes "classic-double-beep" with 880Hz tones and ~250ms duration', () => {
      const played = playAlarmSound('classic-double-beep');
      expect(played).toBe(true);

      expect(MockAudioContext.createdOscillators.length).toBe(2);
      expect(MockAudioContext.createdGains.length).toBe(1);

      const osc1 = MockAudioContext.createdOscillators[0];
      expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(880, 100.0);
      expect(osc1.stop).toHaveBeenCalledWith(100.0 + 0.25);
    });

    it('synthesizes "soft-chime" with full 450ms duration (not truncated by 350ms cap)', () => {
      const played = playAlarmSound('soft-chime');
      expect(played).toBe(true);

      // 4 oscillators (2 fundamental + 2 harmonic layers) and 2 gain nodes
      expect(MockAudioContext.createdOscillators.length).toBe(4);
      expect(MockAudioContext.createdGains.length).toBe(2);

      const osc1 = MockAudioContext.createdOscillators[0];
      const osc2 = MockAudioContext.createdOscillators[2];

      // Tone 1: D5 (587.33 Hz) -> Tone 2: A5 (880.00 Hz)
      expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(587.33, 100.0);
      expect(osc2.frequency.setValueAtTime).toHaveBeenCalledWith(880.00, 100.0 + 0.15);

      // Verify stop time preserves full natural decay (~450-460ms)
      expect(osc2.stop).toHaveBeenCalledWith(100.0 + 0.46);
    });

    it('synthesizes "urgent-pulse" with 987.77Hz triple pulse and ~320ms duration', () => {
      const played = playAlarmSound('urgent-pulse');
      expect(played).toBe(true);

      const osc1 = MockAudioContext.createdOscillators[0];
      expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(987.77, 100.0);
      expect(osc1.stop).toHaveBeenCalledWith(100.0 + 0.32);

      // Verify 3 distinct gain pulses scheduled
      const gain = MockAudioContext.createdGains[0];
      expect(gain.gain.setValueAtTime).toHaveBeenCalledTimes(3);
    });

    it('synthesizes "high-low-alert" with full 380ms duration (not truncated by 350ms cap)', () => {
      const played = playAlarmSound('high-low-alert');
      expect(played).toBe(true);

      const osc1 = MockAudioContext.createdOscillators[0];
      // High tone (784 Hz G5) transitioning to Low tone (587.33 Hz D5)
      expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(784.00, 100.0);
      expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(587.33, 100.0 + 0.16);

      // Verify stop time preserves full cadence (~380ms)
      expect(osc1.stop).toHaveBeenCalledWith(100.0 + 0.38);
    });

    it('falls back to default profile when playAlarmSound is called without args or invalid profile', () => {
      playAlarmSound();
      const osc1 = MockAudioContext.createdOscillators[0];
      expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(880, 100.0);

      MockAudioContext.reset();
      playAlarmSound('non-existent-profile' as any);
      const oscFallback = MockAudioContext.createdOscillators[0];
      expect(oscFallback.frequency.setValueAtTime).toHaveBeenCalledWith(880, 100.0);
    });
  });

  describe('3. Decoupled Preview & Live Alarm Prioritization', () => {
    let notifier: AlarmAudioNotifier;

    beforeEach(() => {
      (global as any).window = { AudioContext: MockAudioContext };
      notifier = new AlarmAudioNotifier();
      notifier.clear();
    });

    it('previewing a tune does NOT consume or register alarm IDs in the notifier', () => {
      // User previews all tunes
      playAlarmSound('urgent-pulse');
      playAlarmSound('soft-chime');
      playAlarmSound('high-low-alert');

      // Seen count remains 0
      expect(notifier.getSeenCount()).toBe(0);
    });

    it('a live CRITICAL alarm is NEVER dropped even if preview was just triggered', () => {
      // User just triggered a preview
      playAlarmSound('soft-chime');
      expect(notifier.getSeenCount()).toBe(0);

      // Incoming live critical alarm arrives immediately
      const liveAlarm = { id: 'live-crit-001', severity: 'CRITICAL', status: 'ACTIVE' };
      const played = notifier.handleIncomingAlarm(liveAlarm, true, 'urgent-pulse');

      expect(played).toBe(true);
      expect(notifier.getSeenCount()).toBe(1);
    });

    it('passes the user selected profile to live alarm playback', () => {
      const liveAlarm = { id: 'live-fatal-001', severity: 'FATAL', status: 'ACTIVE' };
      notifier.handleIncomingAlarm(liveAlarm, true, 'high-low-alert');

      // Verify high-low alert frequencies were used
      const osc1 = MockAudioContext.createdOscillators[0];
      expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(784.00, 100.0);
    });

    it('suppresses duplicate alarms regardless of selected profile', () => {
      const liveAlarm = { id: 'dup-001', severity: 'CRITICAL', status: 'ACTIVE' };

      // First time plays
      expect(notifier.handleIncomingAlarm(liveAlarm, true, 'soft-chime')).toBe(true);

      // Second time with different profile is strictly suppressed
      expect(notifier.handleIncomingAlarm(liveAlarm, true, 'urgent-pulse')).toBe(false);
      expect(notifier.getSeenCount()).toBe(1);
    });

    it('suppresses inactive and non-critical/non-warning alarms with profile passed', () => {
      // In Checkpoint 5, WARNING is audible using warning profile
      expect(notifier.handleIncomingAlarm({ id: 'a1', severity: 'WARNING', status: 'ACTIVE' }, true, 'urgent-pulse')).toBe(true);
      // INFO remains strictly silent
      expect(notifier.handleIncomingAlarm({ id: 'a2', severity: 'INFO', status: 'ACTIVE' }, true, 'urgent-pulse')).toBe(false);
      expect(notifier.handleIncomingAlarm({ id: 'a3', severity: 'CRITICAL', status: 'ACKNOWLEDGED' }, true, 'urgent-pulse')).toBe(false);
      expect(notifier.handleIncomingAlarm({ id: 'a4', severity: 'CRITICAL', status: 'CLEARED' }, true, 'urgent-pulse')).toBe(false);
    });

    it('historical seeded alarms remain silent when delivered over WebSocket with profile', () => {
      notifier.seedHistoricalAlarms([
        { id: 'hist-crit-1', severity: 'CRITICAL', status: 'ACTIVE' },
      ]);

      expect(notifier.handleIncomingAlarm({ id: 'hist-crit-1', severity: 'CRITICAL', status: 'ACTIVE' }, true, 'urgent-pulse')).toBe(false);
    });
  });

  describe('4. AudioContext Failure & Autoplay Handling', () => {
    it('returns false safely when window is undefined', () => {
      delete (global as any).window;
      expect(playAlarmSound('soft-chime')).toBe(false);
    });

    it('returns false safely when AudioContext constructor fails', () => {
      function ThrowingAudioContext() {
        throw new Error('AudioContext creation prohibited');
      }
      (global as any).window = {
        AudioContext: ThrowingAudioContext,
      };
      expect(playAlarmSound('urgent-pulse')).toBe(false);
    });

    it('returns false safely when browser autoplay policy blocks resume', () => {
      MockAudioContext.initialState = 'suspended';
      MockAudioContext.shouldResumeSucceed = false;
      (global as any).window = { AudioContext: MockAudioContext };

      expect(playAlarmSound('high-low-alert')).toBe(false);
    });
  });
});
