import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AlarmAudioNotifier,
  playAlarmSound,
  playAlarmChime,
  resumeAudioContext,
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

// Mock Web Audio API AudioContext for testing
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
    this.currentTime = 200.0;
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
          linearRampToValueAtTime: vi.fn(),
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

describe('Checkpoint 5: Sound Notifications, Soft Chime Bug Fix & Severity Sound Profiles', () => {
  beforeEach(() => {
    resetSharedAudioContextForTesting();
    MockAudioContext.reset();
  });

  afterEach(() => {
    delete (global as any).window;
    resetSharedAudioContextForTesting();
  });

  describe('1. Preference Validation, Defaults, and Legacy Migration', () => {
    it('sets default warning profile to "soft-chime" and critical profile to "urgent-pulse"', () => {
      expect(DEFAULT_PREFERENCES.warningAlarmSoundProfile).toBe('soft-chime');
      expect(DEFAULT_PREFERENCES.criticalAlarmSoundProfile).toBe('urgent-pulse');
      expect(DEFAULT_PREFERENCES.alarmSoundProfile).toBe('classic-double-beep');
    });

    it('accepts all valid profile IDs for warning and critical profiles', () => {
      for (const id of VALID_SOUND_PROFILES) {
        const validated = validatePreferences({
          warningAlarmSoundProfile: id,
          criticalAlarmSoundProfile: id,
        });
        expect(validated.warningAlarmSoundProfile).toBe(id);
        expect(validated.criticalAlarmSoundProfile).toBe(id);
      }
    });

    it('falls back defensively to defaults when profiles are invalid, null, or malformed', () => {
      const res = validatePreferences({
        warningAlarmSoundProfile: 'invalid-tune',
        criticalAlarmSoundProfile: 999 as any,
      });
      expect(res.warningAlarmSoundProfile).toBe('soft-chime');
      expect(res.criticalAlarmSoundProfile).toBe('urgent-pulse');

      const nullRes = validatePreferences({
        warningAlarmSoundProfile: null,
        criticalAlarmSoundProfile: undefined,
      });
      expect(nullRes.warningAlarmSoundProfile).toBe('soft-chime');
      expect(nullRes.criticalAlarmSoundProfile).toBe('urgent-pulse');
    });

    it('migrates legacy alarmSoundProfile to criticalAlarmSoundProfile when criticalAlarmSoundProfile is absent', () => {
      const legacy = {
        powerUnit: 'MW',
        energyUnit: 'MWh',
        timeFormat: '24h',
        dateFormat: 'YYYY-MM-DD',
        timezoneMode: 'browser',
        defaultReportRange: 'Last 7 Days',
        alarmSoundEnabled: true,
        alarmSoundProfile: 'high-low-alert',
      };

      const migrated = validatePreferences(legacy);
      expect(migrated.alarmSoundProfile).toBe('high-low-alert');
      expect(migrated.criticalAlarmSoundProfile).toBe('high-low-alert');
      expect(migrated.warningAlarmSoundProfile).toBe('soft-chime'); // Default warning
      expect(migrated.powerUnit).toBe('MW');
      expect(migrated.energyUnit).toBe('MWh');
    });

    it('preserves existing criticalAlarmSoundProfile if already set, regardless of legacy alarmSoundProfile', () => {
      const explicit = {
        alarmSoundProfile: 'classic-double-beep',
        criticalAlarmSoundProfile: 'urgent-pulse',
        warningAlarmSoundProfile: 'high-low-alert',
      };

      const res = validatePreferences(explicit);
      expect(res.criticalAlarmSoundProfile).toBe('urgent-pulse');
      expect(res.warningAlarmSoundProfile).toBe('high-low-alert');
      expect(res.alarmSoundProfile).toBe('classic-double-beep');
    });
  });

  describe('2. Soft Chime Synthesis Fix & Acoustic Quality', () => {
    beforeEach(() => {
      (global as any).window = { AudioContext: MockAudioContext };
    });

    it('synthesizes Soft Chime with dual tones D5 -> A5 and harmonic triangle layers', () => {
      const played = playAlarmSound('soft-chime');
      expect(played).toBe(true);

      // Must have 4 oscillators: Tone 1 (sine + triangle) and Tone 2 (sine + triangle)
      expect(MockAudioContext.createdOscillators.length).toBe(4);
      expect(MockAudioContext.createdGains.length).toBe(2);

      const osc1 = MockAudioContext.createdOscillators[0];
      const osc1Sub = MockAudioContext.createdOscillators[1];
      const osc2 = MockAudioContext.createdOscillators[2];
      const osc2Sub = MockAudioContext.createdOscillators[3];

      // Tone 1: 587.33 Hz (D5)
      expect(osc1.type).toBe('sine');
      expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(587.33, 200.0);
      expect(osc1Sub.type).toBe('triangle');
      expect(osc1Sub.frequency.setValueAtTime).toHaveBeenCalledWith(587.33, 200.0);

      // Tone 2: 880.00 Hz (A5) scheduled at +0.15s
      expect(osc2.type).toBe('sine');
      expect(osc2.frequency.setValueAtTime).toHaveBeenCalledWith(880.00, 200.0 + 0.15);
      expect(osc2Sub.type).toBe('triangle');
      expect(osc2Sub.frequency.setValueAtTime).toHaveBeenCalledWith(880.00, 200.0 + 0.15);

      // Tone 1 gain envelope: musical attack to 0.12 in 15ms, decaying to 0.0001 at +0.16s
      const gain1 = MockAudioContext.createdGains[0];
      expect(gain1.gain.setValueAtTime).toHaveBeenCalledWith(0.001, 200.0);
      expect(gain1.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.12, 200.0 + 0.015);
      expect(gain1.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 200.0 + 0.16);

      // Tone 2 gain envelope: bell strike attack to 0.13 at +0.165s, natural musical decay to +0.45s
      const gain2 = MockAudioContext.createdGains[1];
      expect(gain2.gain.setValueAtTime).toHaveBeenCalledWith(0.001, 200.0 + 0.15);
      expect(gain2.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.13, 200.0 + 0.165);
      expect(gain2.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 200.0 + 0.45);

      // Oscillators stopped gracefully
      expect(osc1.stop).toHaveBeenCalledWith(200.0 + 0.16);
      expect(osc2.stop).toHaveBeenCalledWith(200.0 + 0.46);
    });

    it('keeps max peak volume bounded and non-harsh', () => {
      playAlarmSound('soft-chime');
      const gain1 = MockAudioContext.createdGains[0];
      const gain2 = MockAudioContext.createdGains[1];

      // Verify peak volumes stay at comfortable levels (0.12 and 0.13), well below 0.20
      const gain1Peaks = gain1.gain.linearRampToValueAtTime.mock.calls.map((c: any) => c[0]);
      const gain2Peaks = gain2.gain.linearRampToValueAtTime.mock.calls.map((c: any) => c[0]);

      for (const p of [...gain1Peaks, ...gain2Peaks]) {
        expect(p).toBeLessThanOrEqual(0.15);
        expect(p).toBeGreaterThan(0.05); // Audible on small speakers
      }
    });
  });

  describe('3. AudioContext Resume & Autoplay Restriction Handling', () => {
    it('resumes suspended AudioContext and returns true on success', async () => {
      MockAudioContext.initialState = 'suspended';
      (global as any).window = { AudioContext: MockAudioContext };

      const resumed = await resumeAudioContext();
      expect(resumed).toBe(true);

      const ctx = MockAudioContext.instances[0];
      expect(ctx.resume).toHaveBeenCalled();
      expect(ctx.state).toBe('running');
    });

    it('handles autoplay failure gracefully and returns false without throwing', async () => {
      MockAudioContext.initialState = 'suspended';
      MockAudioContext.shouldResumeSucceed = false;
      (global as any).window = { AudioContext: MockAudioContext };

      const resumed = await resumeAudioContext();
      expect(resumed).toBe(false);
    });

    it('returns false from playAlarmSound if AudioContext is not running and cannot resume', () => {
      MockAudioContext.initialState = 'suspended';
      MockAudioContext.shouldResumeSucceed = false;
      (global as any).window = { AudioContext: MockAudioContext };

      const played = playAlarmSound('soft-chime');
      expect(played).toBe(false);
      expect(MockAudioContext.createdOscillators.length).toBe(0);
    });
  });

  describe('4. Independent Severity Routing (WARNING vs CRITICAL / FATAL vs INFO)', () => {
    let notifier: AlarmAudioNotifier;

    beforeEach(() => {
      (global as any).window = { AudioContext: MockAudioContext };
      notifier = new AlarmAudioNotifier();
    });

    it('routes WARNING alarms to the configured warning profile', () => {
      const played = notifier.handleIncomingAlarm(
        { id: 'alm-warn-1', severity: 'WARNING', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );

      expect(played).toBe(true);
      // Soft chime produces 4 oscillators
      expect(MockAudioContext.createdOscillators.length).toBe(4);
      expect(MockAudioContext.createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(587.33, 200.0);
    });

    it('routes CRITICAL alarms to the configured critical profile', () => {
      const played = notifier.handleIncomingAlarm(
        { id: 'alm-crit-1', severity: 'CRITICAL', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );

      expect(played).toBe(true);
      // Urgent pulse produces 987.77Hz pulses
      expect(MockAudioContext.createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(987.77, 200.0);
    });

    it('routes FATAL alarms to the configured critical profile', () => {
      const played = notifier.handleIncomingAlarm(
        { id: 'alm-fatal-1', severity: 'FATAL', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'high-low-alert' }
      );

      expect(played).toBe(true);
      // High-low alert produces 784 Hz G5 tone
      expect(MockAudioContext.createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(784.00, 200.0);
    });

    it('keeps INFO alarms strictly silent', () => {
      const played = notifier.handleIncomingAlarm(
        { id: 'alm-info-1', severity: 'INFO', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );

      expect(played).toBe(false);
      expect(MockAudioContext.createdOscillators.length).toBe(0);
    });

    it('remains silent when soundEnabled is false for any severity', () => {
      expect(
        notifier.handleIncomingAlarm(
          { id: 'alm-crit-muted', severity: 'CRITICAL', status: 'ACTIVE' },
          false,
          { warning: 'soft-chime', critical: 'urgent-pulse' }
        )
      ).toBe(false);

      expect(
        notifier.handleIncomingAlarm(
          { id: 'alm-warn-muted', severity: 'WARNING', status: 'ACTIVE' },
          false,
          { warning: 'soft-chime', critical: 'urgent-pulse' }
        )
      ).toBe(false);

      expect(MockAudioContext.createdOscillators.length).toBe(0);
    });
  });

  describe('5. Deduplication, Lifecycle Filtering & Historical Silence', () => {
    let notifier: AlarmAudioNotifier;

    beforeEach(() => {
      (global as any).window = { AudioContext: MockAudioContext };
      notifier = new AlarmAudioNotifier();
    });

    it('blocks duplicate audio for the same alarm ID', () => {
      const first = notifier.handleIncomingAlarm(
        { id: 'alm-dup-1', severity: 'CRITICAL', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );
      expect(first).toBe(true);

      const second = notifier.handleIncomingAlarm(
        { id: 'alm-dup-1', severity: 'CRITICAL', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );
      expect(second).toBe(false);
    });

    it('does not play audio for non-ACTIVE alarms (e.g. ACKNOWLEDGED or RESOLVED)', () => {
      expect(
        notifier.handleIncomingAlarm(
          { id: 'alm-ack-1', severity: 'CRITICAL', status: 'ACKNOWLEDGED' },
          true
        )
      ).toBe(false);

      expect(
        notifier.handleIncomingAlarm(
          { id: 'alm-res-1', severity: 'CRITICAL', status: 'RESOLVED' },
          true
        )
      ).toBe(false);

      expect(MockAudioContext.createdOscillators.length).toBe(0);
    });

    it('silences seeded historical alarms so pre-existing alarms never chime on page load', () => {
      notifier.seedHistoricalAlarms([
        { id: 'hist-1', severity: 'CRITICAL', status: 'ACTIVE' },
        { id: 'hist-2', severity: 'WARNING', status: 'ACTIVE' },
      ]);

      expect(notifier.getSeenCount()).toBe(2);

      // When the WebSocket subsequently fires for hist-1, it must be silenced
      const played = notifier.handleIncomingAlarm(
        { id: 'hist-1', severity: 'CRITICAL', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );
      expect(played).toBe(false);
      expect(MockAudioContext.createdOscillators.length).toBe(0);
    });
  });

  describe('6. Preview / Live Concurrency Decoupling', () => {
    let notifier: AlarmAudioNotifier;

    beforeEach(() => {
      (global as any).window = { AudioContext: MockAudioContext };
      notifier = new AlarmAudioNotifier();
    });

    it('allows live alarm audio to play even when user has previewed a sound', () => {
      // User previews soft chime
      const previewPlayed = playAlarmSound('soft-chime');
      expect(previewPlayed).toBe(true);
      const previewOscCount = MockAudioContext.createdOscillators.length;

      // An actual live critical alarm arrives immediately
      const livePlayed = notifier.handleIncomingAlarm(
        { id: 'live-critical-123', severity: 'CRITICAL', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );

      expect(livePlayed).toBe(true);
      expect(MockAudioContext.createdOscillators.length).toBeGreaterThan(previewOscCount);
    });
  });

  describe('7. Backward Compatibility', () => {
    let notifier: AlarmAudioNotifier;

    beforeEach(() => {
      (global as any).window = { AudioContext: MockAudioContext };
      notifier = new AlarmAudioNotifier();
    });

    it('supports single profileId string argument (legacy signature)', () => {
      const played = notifier.handleIncomingAlarm(
        { id: 'legacy-crit-1', severity: 'CRITICAL', status: 'ACTIVE' },
        true,
        'urgent-pulse'
      );
      expect(played).toBe(true);
    });

    it('playAlarmChime alias forwards correctly to playAlarmSound', () => {
      const played = playAlarmChime('classic-double-beep');
      expect(played).toBe(true);
      expect(MockAudioContext.createdOscillators.length).toBe(2);
    });
  });
});
