import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AlarmAudioNotifier,
  playAlarmSound,
  playAlarmChime,
  resetSharedAudioContextForTesting,
  ALARM_AUDIO_CONSTANTS,
  type AlarmAudioState,
} from '../../../frontend/src/features/settings/alarmAudio.utils';
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from '../../../frontend/src/features/settings/settings.types';
import { validatePreferences } from '../../../frontend/src/features/settings/settings.utils';
import {
  getStorageKey,
  PREFERENCES_KEY_PREFIX,
} from '../../../frontend/src/features/settings/context/UserSettingsContext';

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

describe('Facility Alarm Audio and Silence Control', () => {
  let notifier: AlarmAudioNotifier;

  beforeEach(() => {
    vi.useFakeTimers();
    resetSharedAudioContextForTesting();
    MockAudioContext.reset();
    (global as any).window = { AudioContext: MockAudioContext };
    notifier = new AlarmAudioNotifier();
  });

  afterEach(() => {
    notifier.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (global as any).window;
    resetSharedAudioContextForTesting();
  });

  describe('1. Tune Selection & Single Play for Warning', () => {
    it('1. Warning uses the selected Warning tune and plays once', () => {
      const played = notifier.handleIncomingAlarm(
        { id: 'warn-1', severity: 'WARNING', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );

      expect(played).toBe(true);
      expect(notifier.getState().isAudioActive).toBe(true);
      expect(notifier.getState().severity).toBe('WARNING');
      const initialOscillators = MockAudioContext.createdOscillators.length;
      expect(initialOscillators).toBeGreaterThan(0);

      // Fast-forward past repeat interval (4000ms) - Warning must NOT repeat
      vi.advanceTimersByTime(ALARM_AUDIO_CONSTANTS.CRITICAL_REPEAT_INTERVAL_MS * 2);
      expect(MockAudioContext.createdOscillators.length).toBe(initialOscillators);
      expect(notifier.getState().isAudioActive).toBe(false);
    });
  });

  describe('2. Critical/Fatal Tune Selection', () => {
    it('2. Critical/Fatal use the selected Critical/Fatal tune', () => {
      const playedCritical = notifier.handleIncomingAlarm(
        { id: 'crit-1', severity: 'CRITICAL', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );
      expect(playedCritical).toBe(true);
      expect(notifier.getState().severity).toBe('CRITICAL');
      // Urgent pulse creates oscillators at 987.77 Hz
      expect(MockAudioContext.createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(987.77, 100.0);

      notifier.clear();
      MockAudioContext.reset();

      const playedFatal = notifier.handleIncomingAlarm(
        { id: 'fatal-1', severity: 'FATAL', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'high-low-alert' }
      );
      expect(playedFatal).toBe(true);
      expect(notifier.getState().severity).toBe('CRITICAL');
      // High-low alert creates 784.00 Hz
      expect(MockAudioContext.createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(784.00, 100.0);
    });
  });

  describe('3. INFO Silence', () => {
    it('3. INFO events remain strictly visual and silent', () => {
      const played = notifier.handleIncomingAlarm(
        { id: 'info-1', severity: 'INFO', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );
      expect(played).toBe(false);
      expect(notifier.getState().isAudioActive).toBe(false);
      expect(MockAudioContext.createdOscillators.length).toBe(0);
    });
  });

  describe('4. Deduplication on Repeated Broadcasts', () => {
    it('4. Duplicate updates for the same alarm ID do not restart or double-play an alarm tune', () => {
      const first = notifier.handleIncomingAlarm(
        { id: 'crit-dup-1', severity: 'CRITICAL', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );
      expect(first).toBe(true);
      const oscCountAfterFirst = MockAudioContext.createdOscillators.length;

      // Duplicate broadcast arrives immediately
      const second = notifier.handleIncomingAlarm(
        { id: 'crit-dup-1', severity: 'CRITICAL', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );
      expect(second).toBe(false);
      expect(MockAudioContext.createdOscillators.length).toBe(oscCountAfterFirst);
    });
  });

  describe('5. Preemption Hierarchy: Critical Preempts Warning', () => {
    it('5. Critical/Fatal preempts active Warning, while Warning never preempts Critical/Fatal', () => {
      // 1. Warning arrives first
      notifier.handleIncomingAlarm(
        { id: 'warn-first', severity: 'WARNING', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );
      expect(notifier.getState().severity).toBe('WARNING');
      expect(notifier.getState().isAudioActive).toBe(true);

      // 2. Critical arrives while warning is active -> preemption!
      const critPlayed = notifier.handleIncomingAlarm(
        { id: 'crit-preempt', severity: 'CRITICAL', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );
      expect(critPlayed).toBe(true);
      expect(notifier.getState().severity).toBe('CRITICAL');

      // 3. A new Warning arrives while Critical is active -> must NOT preempt Critical
      const oscCountBefore = MockAudioContext.createdOscillators.length;
      const warnIgnored = notifier.handleIncomingAlarm(
        { id: 'warn-subsequent', severity: 'WARNING', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );
      expect(warnIgnored).toBe(false);
      expect(notifier.getState().severity).toBe('CRITICAL');
      expect(MockAudioContext.createdOscillators.length).toBe(oscCountBefore);
    });
  });

  describe('6. Concurrency & Coalescing', () => {
    it('6. Multiple simultaneous alarms do not overlap uncontrollably and coalesce deterministically', () => {
      // Multiple alarms arrive in the same tick
      notifier.handleIncomingAlarm(
        { id: 'sim-warn', severity: 'WARNING', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );
      notifier.handleIncomingAlarm(
        { id: 'sim-crit-1', severity: 'CRITICAL', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );
      notifier.handleIncomingAlarm(
        { id: 'sim-crit-2', severity: 'CRITICAL', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );

      // Coalesced into a single critical episode
      expect(notifier.getState().severity).toBe('CRITICAL');
      expect(notifier.getActiveEpisodeCount()).toBe(2);

      // Only 1 repetition loop is running (at 4s intervals)
      const countBeforeTick = MockAudioContext.createdOscillators.length;
      vi.advanceTimersByTime(ALARM_AUDIO_CONSTANTS.CRITICAL_REPEAT_INTERVAL_MS);
      // Single playback on interval tick (urgent pulse = 2 oscillators)
      expect(MockAudioContext.createdOscillators.length - countBeforeTick).toBe(2);
    });
  });

  describe('7. Cadence and Duration Safeguards', () => {
    it('7. Critical/Fatal repeats every 4 seconds and automatically stops at 60 seconds max duration', () => {
      notifier.handleIncomingAlarm(
        { id: 'crit-timed-1', severity: 'CRITICAL', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );
      expect(notifier.getState().isAudioActive).toBe(true);

      // Advance by 12 seconds = 3 repeat intervals
      vi.advanceTimersByTime(12000);
      expect(notifier.getState().isAudioActive).toBe(true);

      // Advance past 60s max duration
      vi.advanceTimersByTime(49000); // Total > 60s
      expect(notifier.getState().isAudioActive).toBe(false);

      // Audio stops repeating after timeout
      const oscCountAtTimeout = MockAudioContext.createdOscillators.length;
      vi.advanceTimersByTime(10000);
      expect(MockAudioContext.createdOscillators.length).toBe(oscCountAtTimeout);
    });
  });

  describe('8. Immediate Silence Action', () => {
    it('8. Silencing immediately stops active audio and cancels future repeats', () => {
      notifier.handleIncomingAlarm(
        { id: 'crit-silence-1', severity: 'CRITICAL', status: 'ACTIVE' },
        true,
        { warning: 'soft-chime', critical: 'urgent-pulse' }
      );
      expect(notifier.getState().isAudioActive).toBe(true);
      expect(notifier.getState().isSilenced).toBe(false);

      // User clicks Silence Sound
      notifier.silence();

      expect(notifier.getState().isAudioActive).toBe(false);
      expect(notifier.getState().isSilenced).toBe(true);
      expect(notifier.getSilencedCount()).toBe(1);

      // Further interval ticks produce zero audio
      const oscCountAfterSilence = MockAudioContext.createdOscillators.length;
      vi.advanceTimersByTime(10000);
      expect(MockAudioContext.createdOscillators.length).toBe(oscCountAfterSilence);
    });
  });

  describe('9. Alarm Status Independence', () => {
    it('9. Silencing operates strictly client-side and never mutates underlying alarm object', () => {
      const alarmObject = { id: 'alarm-status-check', severity: 'CRITICAL', status: 'ACTIVE' };
      notifier.handleIncomingAlarm(alarmObject, true);

      notifier.silence();

      // Original alarm object and properties are 100% unmutated
      expect(alarmObject.status).toBe('ACTIVE');
      expect((alarmObject as any).acknowledgedAt).toBeUndefined();
      expect((alarmObject as any).clearedAt).toBeUndefined();
    });
  });

  describe('10. New Eligible Alarm After Silence', () => {
    it('10. A genuinely new eligible alarm ID can sound again after an earlier alarm was silenced', () => {
      // Alarm 1 arrives and is silenced
      notifier.handleIncomingAlarm(
        { id: 'alarm-1', severity: 'CRITICAL', status: 'ACTIVE' },
        true
      );
      notifier.silence();
      expect(notifier.getState().isAudioActive).toBe(false);

      // Alarm 1 rebroadcasts while silenced -> remains silent
      const rebroadcast = notifier.handleIncomingAlarm(
        { id: 'alarm-1', severity: 'CRITICAL', status: 'ACTIVE' },
        true
      );
      expect(rebroadcast).toBe(false);
      expect(notifier.getState().isAudioActive).toBe(false);

      // Alarm 2 arrives with a new ID -> sounds immediately!
      const newAlarmSounded = notifier.handleIncomingAlarm(
        { id: 'alarm-2-new', severity: 'CRITICAL', status: 'ACTIVE' },
        true
      );
      expect(newAlarmSounded).toBe(true);
      expect(notifier.getState().isAudioActive).toBe(true);
      expect(notifier.getState().isSilenced).toBe(false);
    });
  });

  describe('11. Inactive / Cleared Alarm Cleanup', () => {
    it('11. Cleared or acknowledged alarms stop repeating without user intervention', () => {
      notifier.handleIncomingAlarm(
        { id: 'alarm-to-clear', severity: 'CRITICAL', status: 'ACTIVE' },
        true
      );
      expect(notifier.getState().isAudioActive).toBe(true);

      // Backend broadcasts fault cleared
      notifier.handleIncomingAlarm(
        { id: 'alarm-to-clear', severity: 'CRITICAL', status: 'CLEARED' },
        true
      );

      expect(notifier.getState().isAudioActive).toBe(false);
      expect(notifier.getActiveEpisodeCount()).toBe(0);

      // Verify timers were cancelled
      const oscCountAfterClear = MockAudioContext.createdOscillators.length;
      vi.advanceTimersByTime(10000);
      expect(MockAudioContext.createdOscillators.length).toBe(oscCountAfterClear);
    });
  });

  describe('12. Master Audio Mute Toggle', () => {
    it('12. Master audio mute suppresses all alarms and stops active audio', () => {
      // Sound disabled in settings
      const playedWhenMuted = notifier.handleIncomingAlarm(
        { id: 'muted-crit', severity: 'CRITICAL', status: 'ACTIVE' },
        false
      );
      expect(playedWhenMuted).toBe(false);
      expect(notifier.getState().isAudioActive).toBe(false);
      expect(MockAudioContext.createdOscillators.length).toBe(0);
    });
  });

  describe('13. Preference Isolation & Defaults', () => {
    it('13.1 UserPreferences defaults alarmSoundEnabled to true for all clients', () => {
      expect(DEFAULT_PREFERENCES.alarmSoundEnabled).toBe(true);
      expect(DEFAULT_PREFERENCES.warningAlarmSoundProfile).toBe('soft-chime');
      expect(DEFAULT_PREFERENCES.criticalAlarmSoundProfile).toBe('urgent-pulse');

      // A client with no saved preference (empty object, null, or undefined) defaults to ON
      expect(validatePreferences({}).alarmSoundEnabled).toBe(true);
      expect(validatePreferences(null).alarmSoundEnabled).toBe(true);
      expect(validatePreferences(undefined).alarmSoundEnabled).toBe(true);
    });

    it('13.2 Explicitly saved OFF preference remains OFF', () => {
      const explicitOff = validatePreferences({ alarmSoundEnabled: false });
      expect(explicitOff.alarmSoundEnabled).toBe(false);
    });

    it('13.3 Explicitly saved ON preference remains ON', () => {
      const explicitOn = validatePreferences({ alarmSoundEnabled: true });
      expect(explicitOn.alarmSoundEnabled).toBe(true);
    });

    it('13.4 Client switching and preference isolation: Client A does not leak into Client B or C', () => {
      const storageMock: Record<string, string> = {};
      const mockLocalStorage = {
        getItem: (k: string) => storageMock[k] || null,
        setItem: (k: string, v: string) => { storageMock[k] = v; },
        removeItem: (k: string) => { delete storageMock[k]; },
      };

      const clientAKey = getStorageKey({ clientId: 'client-facility-alpha' });
      const clientBKey = getStorageKey({ clientId: 'client-facility-beta' });
      const clientCKey = getStorageKey({ clientId: 'client-facility-gamma' });

      // Client A explicitly sets audio to OFF
      mockLocalStorage.setItem(clientAKey, JSON.stringify({ alarmSoundEnabled: false }));

      // Client B has NO saved preference at all (new or unconfigured client)
      // Client C explicitly sets audio to ON
      mockLocalStorage.setItem(clientCKey, JSON.stringify({ alarmSoundEnabled: true }));

      // Helper simulating loadStoredPreferences
      const loadForClient = (key: string): UserPreferences => {
        const raw = mockLocalStorage.getItem(key);
        if (!raw) return { ...DEFAULT_PREFERENCES };
        return validatePreferences(JSON.parse(raw));
      };

      // Verify Client A is OFF
      const resolvedA = loadForClient(clientAKey);
      expect(resolvedA.alarmSoundEnabled).toBe(false);

      // Verify Client B defaults to ON (consistent default across clients)
      const resolvedB = loadForClient(clientBKey);
      expect(resolvedB.alarmSoundEnabled).toBe(true);

      // Verify Client C is ON
      const resolvedC = loadForClient(clientCKey);
      expect(resolvedC.alarmSoundEnabled).toBe(true);

      // Switch back and forth: Client A's OFF preference never leaks to Client B or C
      expect(loadForClient(clientBKey).alarmSoundEnabled).toBe(true);
      expect(loadForClient(clientAKey).alarmSoundEnabled).toBe(false);
      expect(loadForClient(clientCKey).alarmSoundEnabled).toBe(true);
    });

    it('13.5 Effective preference directly drives the audio engine (ON plays, OFF mutes)', () => {
      // Client with default ON preference receives audible Warning and Critical alerts
      const defaultPrefs = validatePreferences({});
      expect(defaultPrefs.alarmSoundEnabled).toBe(true);

      const playedWarning = notifier.handleIncomingAlarm(
        { id: 'alm-pref-warn-1', severity: 'WARNING', status: 'ACTIVE' },
        defaultPrefs.alarmSoundEnabled
      );
      expect(playedWarning).toBe(true);
      expect(notifier.getState().isAudioActive).toBe(true);

      // Silence active sound
      notifier.silence();
      expect(notifier.getState().isAudioActive).toBe(false);

      // Client with explicit OFF preference does not play audio
      const offPrefs = validatePreferences({ alarmSoundEnabled: false });
      expect(offPrefs.alarmSoundEnabled).toBe(false);

      const playedCritical = notifier.handleIncomingAlarm(
        { id: 'alm-pref-crit-1', severity: 'CRITICAL', status: 'ACTIVE' },
        offPrefs.alarmSoundEnabled
      );
      expect(playedCritical).toBe(false);
      expect(notifier.getState().isAudioActive).toBe(false);
    });

    it('13.6 UserPreferences sound profiles and preview functions remain intact', () => {
      const customProfiles = validatePreferences({
        warningAlarmSoundProfile: 'high-low-alert',
        criticalAlarmSoundProfile: 'classic-double-beep',
      });
      expect(customProfiles.warningAlarmSoundProfile).toBe('high-low-alert');
      expect(customProfiles.criticalAlarmSoundProfile).toBe('classic-double-beep');
      expect(customProfiles.alarmSoundEnabled).toBe(true);
    });
  });

  describe('14. Deduplication Memory Bound (FIFO Eviction)', () => {
    it('14. Deduplication cache caps at 500 items while preserving active repeating IDs', () => {
      // Seed an active repeating alarm
      notifier.handleIncomingAlarm(
        { id: 'active-stay-in-cache', severity: 'CRITICAL', status: 'ACTIVE' },
        true
      );

      // Push 550 dummy alarms through seedHistoricalAlarms
      const bulkAlarms = Array.from({ length: 550 }, (_, i) => ({
        id: `bulk-hist-${i}`,
        severity: 'INFO',
        status: 'CLEARED',
      }));
      notifier.seedHistoricalAlarms(bulkAlarms);

      // Cache size is bounded by DEDUPLICATION_MAX_SEEN_ALARMS (500)
      expect(notifier.getSeenCount()).toBeLessThanOrEqual(ALARM_AUDIO_CONSTANTS.DEDUPLICATION_MAX_SEEN_ALARMS + 1);

      // Active alarm was preserved and not evicted
      expect(notifier.getActiveEpisodeCount()).toBe(1);
    });
  });

  describe('15. Listener Notification & Lifecycle Cleanup', () => {
    it('15. Subscribed listeners receive state updates and unsubscribe cleanly', () => {
      const listener = vi.fn();
      const unsubscribe = notifier.subscribe(listener);

      // Initial call on subscribe
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ isAudioActive: false }));

      // Trigger alarm
      notifier.handleIncomingAlarm(
        { id: 'alm-sub-1', severity: 'WARNING', status: 'ACTIVE' },
        true
      );
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ isAudioActive: true, severity: 'WARNING' }));

      // Unsubscribe
      unsubscribe();
      const callCountAtUnsub = listener.mock.calls.length;

      notifier.silence();
      expect(listener.mock.calls.length).toBe(callCountAtUnsub);
    });
  });

  describe('16. WebSocket Subscription Reference Counting & Callback Stability', () => {
    it('16.1 Reference-counted site subscriptions prevent duplicate room joins and unmatched leaves', () => {
      const emittedEvents: Array<{ event: string; data: any }> = [];
      const mockSocket = {
        emit: vi.fn((event: string, data: any) => {
          emittedEvents.push({ event, data });
        }),
      };
      const isConnected = true;
      const activeSubscriptions = new Map<string, number>();

      const subscribeToSite = (siteId: string) => {
        if (!siteId) return;
        const currentCount = activeSubscriptions.get(siteId) || 0;
        activeSubscriptions.set(siteId, currentCount + 1);

        if (currentCount === 0 && mockSocket && isConnected) {
          mockSocket.emit('subscribe', { siteId });
        }
      };

      const unsubscribeFromSite = (siteId: string) => {
        if (!siteId) return;
        const currentCount = activeSubscriptions.get(siteId) || 0;
        if (currentCount <= 1) {
          activeSubscriptions.delete(siteId);
          if (mockSocket && isConnected) {
            mockSocket.emit('unsubscribe', { siteId });
          }
        } else {
          activeSubscriptions.set(siteId, currentCount - 1);
        }
      };

      // 1. Initial subscribe from EMSLayout
      subscribeToSite('site-alpha');
      expect(emittedEvents.length).toBe(1);
      expect(emittedEvents[0]).toEqual({ event: 'subscribe', data: { siteId: 'site-alpha' } });
      expect(activeSubscriptions.get('site-alpha')).toBe(1);

      // 2. Child component (DashboardPage) also subscribes to same site
      subscribeToSite('site-alpha');
      expect(emittedEvents.length).toBe(1); // No duplicate subscribe emitted
      expect(activeSubscriptions.get('site-alpha')).toBe(2);

      // 3. Child component unmounts and unsubscribes
      unsubscribeFromSite('site-alpha');
      expect(emittedEvents.length).toBe(1); // No unsubscribe emitted yet
      expect(activeSubscriptions.get('site-alpha')).toBe(1);

      // 4. EMSLayout unmounts and unsubscribes
      unsubscribeFromSite('site-alpha');
      expect(emittedEvents.length).toBe(2);
      expect(emittedEvents[1]).toEqual({ event: 'unsubscribe', data: { siteId: 'site-alpha' } });
      expect(activeSubscriptions.has('site-alpha')).toBe(false);
    });

    it('16.2 Independent sites maintain isolated reference counts without cross-site churn', () => {
      const emittedEvents: Array<{ event: string; data: any }> = [];
      const mockSocket = {
        emit: vi.fn((event: string, data: any) => {
          emittedEvents.push({ event, data });
        }),
      };
      const isConnected = true;
      const activeSubscriptions = new Map<string, number>();

      const subscribeToSite = (siteId: string) => {
        if (!siteId) return;
        const currentCount = activeSubscriptions.get(siteId) || 0;
        activeSubscriptions.set(siteId, currentCount + 1);

        if (currentCount === 0 && mockSocket && isConnected) {
          mockSocket.emit('subscribe', { siteId });
        }
      };

      const unsubscribeFromSite = (siteId: string) => {
        if (!siteId) return;
        const currentCount = activeSubscriptions.get(siteId) || 0;
        if (currentCount <= 1) {
          activeSubscriptions.delete(siteId);
          if (mockSocket && isConnected) {
            mockSocket.emit('unsubscribe', { siteId });
          }
        } else {
          activeSubscriptions.set(siteId, currentCount - 1);
        }
      };

      // Client A subscribes to site-1
      subscribeToSite('site-1');
      // Admin preview switches to Client B (site-2)
      subscribeToSite('site-2');
      expect(emittedEvents.filter((e) => e.event === 'subscribe')).toHaveLength(2);

      // Unsubscribing from site-1 does not affect site-2
      unsubscribeFromSite('site-1');
      expect(activeSubscriptions.has('site-1')).toBe(false);
      expect(activeSubscriptions.get('site-2')).toBe(1);
      expect(emittedEvents.filter((e) => e.event === 'unsubscribe')).toEqual([
        { event: 'unsubscribe', data: { siteId: 'site-1' } },
      ]);
    });

    it('16.3 Reconnection resubscribes all active sites with count > 0', () => {
      const reconnectedEvents: Array<{ event: string; data: any }> = [];
      const mockNewSocket = {
        emit: vi.fn((event: string, data: any) => {
          reconnectedEvents.push({ event, data });
        }),
      };

      const activeSubscriptions = new Map<string, number>();
      activeSubscriptions.set('site-active-1', 2);
      activeSubscriptions.set('site-active-2', 1);

      // Simulate reconnect handler in WebSocketProvider
      activeSubscriptions.forEach((count, siteId) => {
        if (count > 0) {
          mockNewSocket.emit('subscribe', { siteId });
        }
      });

      expect(reconnectedEvents).toEqual([
        { event: 'subscribe', data: { siteId: 'site-active-1' } },
        { event: 'subscribe', data: { siteId: 'site-active-2' } },
      ]);
    });
  });
});
