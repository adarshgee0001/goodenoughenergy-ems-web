/**
 * Industrial EMS Alarm Audio & Chime Utilities
 *
 * Uses the standard Web Audio API (zero external assets or audio file dependencies).
 * Respects browser autoplay restrictions and user-interaction requirements.
 * Provides strict deduplication so identical alarms, re-renders, reconnects,
 * or status updates (like ACK) never play repeatedly.
 *
 * Supports independent sound profiles for WARNING and CRITICAL/FATAL alarms.
 * Preview playback is decoupled from live alarm deduplication so genuine
 * incoming critical alarms are never suppressed by preview interactions.
 */

import type { AlarmSoundProfileId } from './settings.types';

export const VALID_SOUND_PROFILES: AlarmSoundProfileId[] = [
  'classic-double-beep',
  'soft-chime',
  'urgent-pulse',
  'high-low-alert',
];

export interface SoundProfileMeta {
  id: AlarmSoundProfileId;
  name: string;
  description: string;
  cadenceDescription: string;
  durationMs: number;
}

export const SOUND_PROFILES: SoundProfileMeta[] = [
  {
    id: 'classic-double-beep',
    name: 'Classic Double Beep',
    description: 'Standard two-tone industrial notification beeps',
    cadenceDescription: 'Crisp dual beep (880 Hz, ~250ms)',
    durationMs: 250,
  },
  {
    id: 'soft-chime',
    name: 'Soft Chime',
    description: 'Gentle, warm two-tone harmonic chime with clear attack',
    cadenceDescription: 'Ascending two-tone chime (587 Hz → 880 Hz, ~450ms)',
    durationMs: 450,
  },
  {
    id: 'urgent-pulse',
    name: 'Urgent Pulse',
    description: 'Fast triple-pulse burst for high-priority facility alerts',
    cadenceDescription: 'Rapid triple pulse (988 Hz, ~320ms)',
    durationMs: 320,
  },
  {
    id: 'high-low-alert',
    name: 'High-Low Alert',
    description: 'Alternating frequency alert for high-noise environments',
    cadenceDescription: 'High-low alternating cadence (784 Hz → 587 Hz, ~380ms)',
    durationMs: 380,
  },
];

let sharedAudioContext: AudioContext | null = null;

export function resetSharedAudioContextForTesting(): void {
  sharedAudioContext = null;
}

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioContext) {
    try {
      sharedAudioContext = new AudioContextClass();
    } catch {
      return null;
    }
  }
  return sharedAudioContext;
}

/**
 * Explicitly awaits AudioContext resume within a user gesture.
 * Returns true if the context successfully entered 'running' state.
 */
export async function resumeAudioContext(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

/**
 * 1. Classic Double Beep
 * Two crisp 880Hz tones separated by a 50ms pause with warm 440Hz body.
 * Duration: ~250ms total.
 */
function synthesizeClassicDoubleBeep(ctx: AudioContext, now: number): void {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(880, now);

  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(440, now);

  // Pulse 1: 0 to 0.09s
  gainNode.gain.setValueAtTime(0.12, now);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

  // Pulse 2: 0.14 to 0.23s
  gainNode.gain.setValueAtTime(0.12, now + 0.14);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.23);

  osc1.connect(gainNode);
  osc2.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.25);
  osc2.stop(now + 0.25);
}

/**
 * 2. Soft Chime (Fixed & Articulated)
 * Elegant two-tone ascending chime: Tone 1 at 587.33 Hz (D5) transitioning to
 * Tone 2 at 880.00 Hz (A5). Uses a subtle triangle harmonic body so the chime
 * projects clearly and warmly on laptop/monitor speakers without harshness.
 * Duration: ~450ms total.
 */
function synthesizeSoftChime(ctx: AudioContext, now: number): void {
  // Tone 1: D5 (587.33 Hz)
  const osc1 = ctx.createOscillator();
  const osc1Sub = ctx.createOscillator();
  const gain1 = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(587.33, now);

  osc1Sub.type = 'triangle';
  osc1Sub.frequency.setValueAtTime(587.33, now);

  // Musical attack (15ms) and gentle decay to 0.14s
  gain1.gain.setValueAtTime(0.001, now);
  gain1.gain.linearRampToValueAtTime(0.12, now + 0.015);
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  osc1.connect(gain1);
  osc1Sub.connect(gain1);
  gain1.connect(ctx.destination);

  osc1.start(now);
  osc1Sub.start(now);
  osc1.stop(now + 0.16);
  osc1Sub.stop(now + 0.16);

  // Tone 2: A5 (880.00 Hz) bell strike at +0.15s
  const osc2 = ctx.createOscillator();
  const osc2Sub = ctx.createOscillator();
  const gain2 = ctx.createGain();

  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(880.00, now + 0.15);

  osc2Sub.type = 'triangle';
  osc2Sub.frequency.setValueAtTime(880.00, now + 0.15);

  // Clear attack and musical exponential decay to 0.45s
  gain2.gain.setValueAtTime(0.001, now + 0.15);
  gain2.gain.linearRampToValueAtTime(0.13, now + 0.165);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

  osc2.connect(gain2);
  osc2Sub.connect(gain2);
  gain2.connect(ctx.destination);

  osc2.start(now + 0.15);
  osc2Sub.start(now + 0.15);
  osc2.stop(now + 0.46);
  osc2Sub.stop(now + 0.46);
}

/**
 * 3. Urgent Pulse
 * Three fast high-frequency pulses at 987.77 Hz (B5).
 * Duration: ~320ms total.
 */
function synthesizeUrgentPulse(ctx: AudioContext, now: number): void {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(987.77, now);

  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(493.88, now);

  // Pulse 1: 0 to 0.07s
  gainNode.gain.setValueAtTime(0.13, now);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

  // Pulse 2: 0.11 to 0.18s
  gainNode.gain.setValueAtTime(0.13, now + 0.11);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  // Pulse 3: 0.22 to 0.29s
  gainNode.gain.setValueAtTime(0.13, now + 0.22);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.29);

  osc1.connect(gainNode);
  osc2.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.32);
  osc2.stop(now + 0.32);
}

/**
 * 4. High-Low Alert
 * Alternating high (784 Hz G5) and low (587.33 Hz D5) frequency alert.
 * Duration: ~380ms total.
 */
function synthesizeHighLowAlert(ctx: AudioContext, now: number): void {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gainNode = ctx.createGain();

  // Tone 1: G5 (784 Hz), Tone 2: D5 (587.33 Hz)
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(784.00, now);
  osc1.frequency.setValueAtTime(587.33, now + 0.16);

  // Subharmonic: G4 (392 Hz) -> D4 (293.66 Hz)
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(392.00, now);
  osc2.frequency.setValueAtTime(293.66, now + 0.16);

  // Cadence: high tone for 160ms, then low tone decaying to 0.36s
  gainNode.gain.setValueAtTime(0.11, now);
  gainNode.gain.exponentialRampToValueAtTime(0.03, now + 0.15);
  gainNode.gain.setValueAtTime(0.11, now + 0.16);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

  osc1.connect(gainNode);
  osc2.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.38);
  osc2.stop(now + 0.38);
}

/**
 * Dispatches synthesis for the specified profile.
 * Falls back to 'classic-double-beep' if profile is invalid or unspecified.
 */
export function playAlarmSound(profileId?: AlarmSoundProfileId): boolean {
  const ctx = getAudioContext();
  if (!ctx || ctx.state === 'closed') return false;

  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (ctx.state !== 'running') {
      alarmAudioNotifier.setAutoplayBlocked(true);
      return false;
    }
    alarmAudioNotifier.setAutoplayBlocked(false);

    const now = ctx.currentTime;
    const resolvedProfile: AlarmSoundProfileId =
      profileId && VALID_SOUND_PROFILES.includes(profileId)
        ? profileId
        : 'classic-double-beep';

    switch (resolvedProfile) {
      case 'soft-chime':
        synthesizeSoftChime(ctx, now);
        break;
      case 'urgent-pulse':
        synthesizeUrgentPulse(ctx, now);
        break;
      case 'high-low-alert':
        synthesizeHighLowAlert(ctx, now);
        break;
      case 'classic-double-beep':
      default:
        synthesizeClassicDoubleBeep(ctx, now);
        break;
    }

    return true;
  } catch (err) {
    console.warn('[AlarmAudio] Unable to play alarm sound:', err);
    return false;
  }
}

/**
 * Backward-compatible alias for existing consumers.
 */
export function playAlarmChime(profileId?: AlarmSoundProfileId): boolean {
  return playAlarmSound(profileId);
}

export interface AlarmEventCandidate {
  id: string;
  severity?: string;
  status?: string;
}

export interface AlarmSeverityProfiles {
  warning?: AlarmSoundProfileId;
  critical?: AlarmSoundProfileId;
}

export const ALARM_AUDIO_CONSTANTS = {
  CRITICAL_REPEAT_INTERVAL_MS: 4000,
  CRITICAL_MAX_DURATION_MS: 60000,
  DEDUPLICATION_MAX_SEEN_ALARMS: 500,
  WARNING_AUDIBLE_DURATION_MS: 1000,
} as const;

export interface AlarmAudioState {
  isAudioActive: boolean;
  severity: 'WARNING' | 'CRITICAL' | null;
  activeAlarmCount: number;
  isSilenced: boolean;
  isAutoplayBlocked: boolean;
}

export class AlarmAudioNotifier {
  private playedAlarmIds = new Set<string>();
  private playedAlarmOrder: string[] = [];
  private activeEpisodeAlarmIds = new Set<string>();
  private silencedAlarmIds = new Set<string>();
  private activeSeverity: 'WARNING' | 'CRITICAL' | null = null;
  private activeCriticalProfile: AlarmSoundProfileId = 'urgent-pulse';

  private repeatTimer: any = null;
  private maxDurationTimer: any = null;
  private warningTimer: any = null;

  private isAudioActive: boolean = false;
  private isSilenced: boolean = false;
  private isAutoplayBlocked: boolean = false;

  private listeners = new Set<(state: AlarmAudioState) => void>();

  public subscribe(listener: (state: AlarmAudioState) => void): () => void {
    this.listeners.add(listener);
    try {
      listener(this.getState());
    } catch (e) {
      console.warn('[AlarmAudio] Error notifying listener on subscribe', e);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): AlarmAudioState {
    return {
      isAudioActive: this.isAudioActive,
      severity: this.activeSeverity,
      activeAlarmCount: this.activeEpisodeAlarmIds.size,
      isSilenced: this.isSilenced,
      isAutoplayBlocked: this.isAutoplayBlocked,
    };
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.warn('[AlarmAudio] Error notifying listener', err);
      }
    });
  }

  public setAutoplayBlocked(blocked: boolean): void {
    if (this.isAutoplayBlocked !== blocked) {
      this.isAutoplayBlocked = blocked;
      this.notify();
    }
  }

  /**
   * Seeds historical alarms into the deduplication set so pre-existing alarms
   * fetched on page load or network reconnect never trigger chimes.
   */
  public seedHistoricalAlarms(alarms: Array<AlarmEventCandidate>): void {
    if (!Array.isArray(alarms)) return;
    for (const a of alarms) {
      if (a && a.id) {
        this.recordAlarmId(a.id);
      }
    }
  }

  private recordAlarmId(id: string): void {
    if (this.playedAlarmIds.has(id)) return;
    this.playedAlarmIds.add(id);
    this.playedAlarmOrder.push(id);

    if (this.playedAlarmOrder.length > ALARM_AUDIO_CONSTANTS.DEDUPLICATION_MAX_SEEN_ALARMS) {
      let evictIdx = -1;
      for (let i = 0; i < this.playedAlarmOrder.length; i++) {
        const candidate = this.playedAlarmOrder[i];
        if (!this.activeEpisodeAlarmIds.has(candidate)) {
          evictIdx = i;
          break;
        }
      }
      if (evictIdx >= 0) {
        const [evicted] = this.playedAlarmOrder.splice(evictIdx, 1);
        this.playedAlarmIds.delete(evicted);
      }
    }
  }

  /**
   * Client-side audio silencing. Immediately stops playing and repeating sounds,
   * cancels repeat/duration timers, and marks the currently active episode alarms
   * as silenced so repeat broadcasts do not restart audio.
   *
   * NEVER alters alarm database records, REST APIs, acknowledgement, or status.
   */
  public silence(): void {
    for (const id of this.activeEpisodeAlarmIds) {
      this.silencedAlarmIds.add(id);
    }
    this.stopPlayback('silenced');
    this.isSilenced = true;
    this.notify();
  }

  /**
   * Stops active playback and cancels repetition timers.
   */
  public stopPlayback(_reason?: string): void {
    if (this.repeatTimer) {
      clearInterval(this.repeatTimer);
      this.repeatTimer = null;
    }
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }

    this.activeEpisodeAlarmIds.clear();
    this.activeSeverity = null;
    this.isAudioActive = false;
    this.notify();
  }

  /**
   * Handles alarm transition to CLEARED, ACKNOWLEDGED, or RESOLVED.
   * If the alarm is part of an active repeating episode, removes it.
   * If no active alarms remain, immediately stops repeating audio.
   */
  public handleAlarmInactive(alarmId: string): void {
    if (this.activeEpisodeAlarmIds.has(alarmId)) {
      this.activeEpisodeAlarmIds.delete(alarmId);
      if (this.activeEpisodeAlarmIds.size === 0) {
        this.stopPlayback('all-alarms-inactive');
      } else {
        this.notify();
      }
    }
  }

  /**
   * Evaluates an incoming alarm event.
   * Plays a chime only if:
   * 1. soundEnabled is true
   * 2. status is 'ACTIVE'
   * 3. severity is 'WARNING', 'CRITICAL', or 'FATAL'
   * 4. The alarm ID has NOT been observed/played or silenced before
   *
   * Decoupled from preview playback so genuine live alarms are never
   * dropped while a user previews sounds in Settings.
   */
  public handleIncomingAlarm(
    alarm: AlarmEventCandidate | null | undefined,
    soundEnabled: boolean,
    profiles?: AlarmSeverityProfiles | AlarmSoundProfileId
  ): boolean {
    if (!alarm || !alarm.id) return false;

    // Handle inactive transitions (CLEARED, ACKNOWLEDGED, RESOLVED)
    if (alarm.status === 'CLEARED' || alarm.status === 'ACKNOWLEDGED' || alarm.status === 'RESOLVED') {
      this.handleAlarmInactive(alarm.id);
      return false;
    }

    // Only ACTIVE alarms can trigger or continue audio
    if (alarm.status !== 'ACTIVE') {
      this.handleAlarmInactive(alarm.id);
      return false;
    }

    // If this specific alarm ID was explicitly silenced by the client, remain silent
    if (this.silencedAlarmIds.has(alarm.id)) {
      return false;
    }

    // Register duplicate check
    if (this.playedAlarmIds.has(alarm.id)) {
      return false;
    }
    this.recordAlarmId(alarm.id);

    if (!soundEnabled) return false;

    // INFO and other severities remain strictly visual and silent
    if (alarm.severity === 'INFO') {
      return false;
    }

    const warningProfile =
      typeof profiles === 'object' && profiles?.warning
        ? profiles.warning
        : 'soft-chime';

    const criticalProfile =
      typeof profiles === 'string'
        ? profiles
        : (profiles?.critical ?? 'urgent-pulse');

    // CRITICAL / FATAL Alarms: Preempt Warning, repeat every 4s up to 60s
    if (alarm.severity === 'CRITICAL' || alarm.severity === 'FATAL') {
      // Preempt any active Warning playback
      if (this.warningTimer) {
        clearTimeout(this.warningTimer);
        this.warningTimer = null;
      }

      this.activeEpisodeAlarmIds.add(alarm.id);
      this.activeSeverity = 'CRITICAL';
      this.activeCriticalProfile = criticalProfile;
      this.isAudioActive = true;
      this.isSilenced = false;

      // Play initial chime immediately
      const played = playAlarmSound(criticalProfile);

      // Start or refresh repeat timer
      if (!this.repeatTimer) {
        this.repeatTimer = setInterval(() => {
          if (this.activeEpisodeAlarmIds.size === 0 || !this.isAudioActive) {
            this.stopPlayback('no-active-alarms');
            return;
          }
          playAlarmSound(this.activeCriticalProfile);
        }, ALARM_AUDIO_CONSTANTS.CRITICAL_REPEAT_INTERVAL_MS);

        this.maxDurationTimer = setTimeout(() => {
          this.stopPlayback('max-duration-reached');
        }, ALARM_AUDIO_CONSTANTS.CRITICAL_MAX_DURATION_MS);
      } else {
        // Additional Critical alarm added to current episode; refresh max duration window
        if (this.maxDurationTimer) {
          clearTimeout(this.maxDurationTimer);
        }
        this.maxDurationTimer = setTimeout(() => {
          this.stopPlayback('max-duration-reached');
        }, ALARM_AUDIO_CONSTANTS.CRITICAL_MAX_DURATION_MS);
      }

      this.notify();
      return played;
    }

    // WARNING Alarms: Play once, never preempt an active Critical alarm
    if (alarm.severity === 'WARNING') {
      // Critical/Fatal playback takes strict priority: Warning must never preempt Critical
      if (this.activeSeverity === 'CRITICAL' && this.isAudioActive) {
        return false;
      }

      if (this.warningTimer) {
        clearTimeout(this.warningTimer);
        this.warningTimer = null;
      }

      this.activeSeverity = 'WARNING';
      this.isAudioActive = true;
      this.isSilenced = false;

      const played = playAlarmSound(warningProfile);

      this.warningTimer = setTimeout(() => {
        if (this.activeSeverity === 'WARNING') {
          this.isAudioActive = false;
          this.activeSeverity = null;
          this.notify();
        }
      }, ALARM_AUDIO_CONSTANTS.WARNING_AUDIBLE_DURATION_MS);

      this.notify();
      return played;
    }

    return false;
  }

  /**
   * Resets all internal state (used for tests or logout).
   */
  public clear(): void {
    this.stopPlayback('clear');
    this.playedAlarmIds.clear();
    this.playedAlarmOrder = [];
    this.activeEpisodeAlarmIds.clear();
    this.silencedAlarmIds.clear();
    this.activeSeverity = null;
    this.isAudioActive = false;
    this.isSilenced = false;
    this.isAutoplayBlocked = false;
    this.notify();
  }

  public getSeenCount(): number {
    return this.playedAlarmIds.size;
  }

  public getActiveEpisodeCount(): number {
    return this.activeEpisodeAlarmIds.size;
  }

  public getSilencedCount(): number {
    return this.silencedAlarmIds.size;
  }

  public isEpisodeActive(): boolean {
    return this.isAudioActive;
  }
}

export const alarmAudioNotifier = new AlarmAudioNotifier();
