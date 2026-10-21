import React, { createContext, useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { PreviewContext } from '../../../context/PreviewContext';
import type {
  UserPreferences,
  UserSettingsContextValue,
} from '../settings.types';
import { DEFAULT_PREFERENCES } from '../settings.types';
import {
  validatePreferences,
  formatPowerDisplay,
  formatEnergyDisplay,
  formatDateCustom,
  formatTimeCustom,
  formatDateTimeCustom,
  resolveEffectiveTimezone,
} from '../settings.utils';
import type { AlarmSoundProfileId } from '../settings.types';
import { playAlarmSound, resumeAudioContext } from '../alarmAudio.utils';

export const UserSettingsContext = createContext<UserSettingsContextValue | undefined>(undefined);

export const PREFERENCES_KEY_PREFIX = 'gee_user_preferences_';

export function getStorageKey(
  scope?: string | { clientId?: string | null; userId?: string | null } | null,
  maybeUserId?: string | null
): string {
  if (typeof scope === 'object' && scope !== null) {
    if (scope.clientId) return `${PREFERENCES_KEY_PREFIX}client_${scope.clientId}`;
    if (scope.userId) return `${PREFERENCES_KEY_PREFIX}user_${scope.userId}`;
    return `${PREFERENCES_KEY_PREFIX}anonymous`;
  }
  if (maybeUserId !== undefined) {
    if (scope) return `${PREFERENCES_KEY_PREFIX}client_${scope}`;
    if (maybeUserId) return `${PREFERENCES_KEY_PREFIX}user_${maybeUserId}`;
    return `${PREFERENCES_KEY_PREFIX}anonymous`;
  }
  if (scope) {
    if (scope.startsWith('client_') || scope.startsWith('user_')) {
      return `${PREFERENCES_KEY_PREFIX}${scope}`;
    }
    return `${PREFERENCES_KEY_PREFIX}${scope}`;
  }
  return `${PREFERENCES_KEY_PREFIX}anonymous`;
}

function loadStoredPreferences(storageKey: string): UserPreferences {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw);
    return validatePreferences(parsed);
  } catch (err) {
    console.warn('[UserSettings] Failed to parse stored preferences; using defaults', err);
    return { ...DEFAULT_PREFERENCES };
  }
}

export const UserSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id;

  const previewContext = useContext(PreviewContext);
  const isPreviewing = previewContext?.isPreviewing;
  const previewClientId = previewContext?.previewClientId;

  const [explicitClientId, setExplicitClientId] = useState<string | null>(null);

  const effectiveClientId = useMemo(() => {
    if (isPreviewing && previewClientId) {
      return previewClientId;
    }
    if (user?.clientId) {
      return user.clientId;
    }
    return explicitClientId;
  }, [isPreviewing, previewClientId, user?.clientId, explicitClientId]);

  const storageKey = useMemo(() => {
    if (effectiveClientId) {
      return getStorageKey(`client_${effectiveClientId}`);
    }
    if (userId) {
      return getStorageKey(`user_${userId}`);
    }
    return getStorageKey(null);
  }, [effectiveClientId, userId]);

  const [preferences, setPreferences] = useState<UserPreferences>(() =>
    loadStoredPreferences(storageKey)
  );
  const [currentStorageKey, setCurrentStorageKey] = useState<string>(storageKey);

  // Synchronously update state during render if storageKey changed to avoid transient stale display
  if (currentStorageKey !== storageKey) {
    setCurrentStorageKey(storageKey);
    setPreferences(loadStoredPreferences(storageKey));
  }

  // Active site timezone reported by the currently viewed Site / Dashboard context
  const [activeSiteTimezone, setActiveSiteTimezoneState] = useState<string | null>(null);

  const setActiveSiteTimezone = useCallback((tz: string | null | undefined) => {
    setActiveSiteTimezoneState(tz || null);
  }, []);

  const setActiveClientId = useCallback((id: string | null | undefined) => {
    setExplicitClientId(id || null);
  }, []);

  // Resolved effective timezone: selected site's IANA timezone in 'site' mode, or browser's timezone in 'browser' mode
  const resolvedTimezone = useMemo(() => {
    return resolveEffectiveTimezone(preferences.timezoneMode, activeSiteTimezone);
  }, [preferences.timezoneMode, activeSiteTimezone]);

  // Re-load when active user changes (switching accounts)
  useEffect(() => {
    setPreferences(loadStoredPreferences(storageKey));
  }, [storageKey]);

  // Synchronize cross-tab storage changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setPreferences(validatePreferences(parsed));
        } catch (err) {
          console.warn('[UserSettings] Failed to parse cross-tab storage change', err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [storageKey]);

  const updatePreferences = useCallback(
    (updates: Partial<UserPreferences>) => {
      setPreferences((prev) => {
        const next: UserPreferences = {
          ...prev,
          ...updates,
        };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch (err) {
          console.error('[UserSettings] Failed to persist user preferences', err);
        }
        return next;
      });
    },
    [storageKey]
  );

  const resetPreferences = useCallback(() => {
    const reset = { ...DEFAULT_PREFERENCES };
    setPreferences(reset);
    try {
      localStorage.setItem(storageKey, JSON.stringify(reset));
    } catch (err) {
      console.error('[UserSettings] Failed to reset preferences in localStorage', err);
    }
  }, [storageKey]);

  // Formatting helpers bound to active preferences and resolved timezone
  const formatPower = useCallback(
    (valueKw: number | undefined | null, maxDecimals = 2) => {
      return formatPowerDisplay(valueKw, preferences.powerUnit, maxDecimals);
    },
    [preferences.powerUnit]
  );

  const formatEnergy = useCallback(
    (valueKwh: number | undefined | null, maxDecimals = 2) => {
      return formatEnergyDisplay(valueKwh, preferences.energyUnit, maxDecimals);
    },
    [preferences.energyUnit]
  );

  const formatDate = useCallback(
    (dateInput: string | number | Date | undefined | null, timeZone?: string) => {
      return formatDateCustom(dateInput, preferences.dateFormat, timeZone ?? resolvedTimezone);
    },
    [preferences.dateFormat, resolvedTimezone]
  );

  const formatTime = useCallback(
    (dateInput: string | number | Date | undefined | null, includeSeconds = false, timeZone?: string) => {
      return formatTimeCustom(dateInput, preferences.timeFormat, includeSeconds, timeZone ?? resolvedTimezone);
    },
    [preferences.timeFormat, resolvedTimezone]
  );

  const formatDateTime = useCallback(
    (dateInput: string | number | Date | undefined | null, includeSeconds = false, timeZone?: string) => {
      return formatDateTimeCustom(
        dateInput,
        preferences.dateFormat,
        preferences.timeFormat,
        includeSeconds,
        timeZone ?? resolvedTimezone
      );
    },
    [preferences.dateFormat, preferences.timeFormat, resolvedTimezone]
  );

  const playTestChime = useCallback(
    async (profileId?: AlarmSoundProfileId): Promise<boolean> => {
      try {
        const canPlay = await resumeAudioContext();
        if (!canPlay) return false;
        return playAlarmSound(profileId ?? preferences.criticalAlarmSoundProfile ?? preferences.alarmSoundProfile);
      } catch {
        return false;
      }
    },
    [preferences.criticalAlarmSoundProfile, preferences.alarmSoundProfile]
  );

  const contextValue = useMemo<UserSettingsContextValue>(
    () => ({
      preferences,
      updatePreferences,
      resetPreferences,
      activeClientId: effectiveClientId,
      setActiveClientId,
      activeSiteTimezone,
      setActiveSiteTimezone,
      resolvedTimezone,
      formatPower,
      formatEnergy,
      formatDate,
      formatTime,
      formatDateTime,
      playTestChime,
    }),
    [
      preferences,
      updatePreferences,
      resetPreferences,
      effectiveClientId,
      setActiveClientId,
      activeSiteTimezone,
      setActiveSiteTimezone,
      resolvedTimezone,
      formatPower,
      formatEnergy,
      formatDate,
      formatTime,
      formatDateTime,
      playTestChime,
    ]
  );

  return (
    <UserSettingsContext.Provider value={contextValue}>
      {children}
    </UserSettingsContext.Provider>
  );
};
