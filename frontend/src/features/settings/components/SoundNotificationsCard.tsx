import React, { useState } from 'react';
import { Volume2, VolumeX, Check, AlertTriangle, AlertOctagon, Info } from 'lucide-react';
import type { UserPreferences, AlarmSoundProfileId } from '../settings.types';
import { SOUND_PROFILES } from '../alarmAudio.utils';
import { useUserSettings } from '../hooks/useUserSettings';

interface SoundNotificationsCardProps {
  preferences: UserPreferences;
  onUpdate: (updates: Partial<UserPreferences>) => void;
}

export const SoundNotificationsCard: React.FC<SoundNotificationsCardProps> = ({
  preferences,
  onUpdate,
}) => {
  const { playTestChime } = useUserSettings();
  const [previewingProfile, setPreviewingProfile] = useState<AlarmSoundProfileId | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const handlePreview = async (profileId: AlarmSoundProfileId) => {
    if (previewingProfile) return; // Independent preview debounce
    setPreviewingProfile(profileId);
    setAudioBlocked(false);

    try {
      const success = await playTestChime(profileId);
      if (!success) {
        setAudioBlocked(true);
        setTimeout(() => setAudioBlocked(false), 4000);
        setPreviewingProfile(null);
        return;
      }

      const meta = SOUND_PROFILES.find((p) => p.id === profileId);
      const dur = meta ? meta.durationMs + 100 : 500;
      setTimeout(() => {
        setPreviewingProfile(null);
      }, dur);
    } catch {
      setAudioBlocked(true);
      setPreviewingProfile(null);
      setTimeout(() => setAudioBlocked(false), 4000);
    }
  };

  const warningMeta = SOUND_PROFILES.find((p) => p.id === preferences.warningAlarmSoundProfile);
  const criticalMeta = SOUND_PROFILES.find((p) => p.id === preferences.criticalAlarmSoundProfile);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Facility Alarm Notifications</h2>
            <p className="text-xs text-slate-500">Configure audible notifications for active alarms at your facility.</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Master Sound Notifications Toggle */}
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
              Facility Audio Alerts
            </label>
            <div className="grid grid-cols-1 gap-2.5">
              {[true, false].map((enabled) => {
                const isSelected = preferences.alarmSoundEnabled === enabled;
                return (
                  <button
                    key={enabled ? 'enabled' : 'muted'}
                    type="button"
                    onClick={() => onUpdate({ alarmSoundEnabled: enabled })}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium transition-all text-left ${
                      isSelected
                        ? 'border-primary-600 bg-primary-50 text-primary-900 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {enabled ? (
                        <Volume2 className="w-4 h-4 text-primary-600 shrink-0" />
                      ) : (
                        <VolumeX className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <div>
                        <span className="block font-semibold">
                          {enabled ? 'Sound On — Audible Alarm Alerts' : 'Sound Off — Visual Alerts Only'}
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          {enabled
                            ? 'Play the configured sound when an eligible Warning, Critical, or Fatal alarm occurs.'
                            : 'Keep alarms visible in the application without audible notifications.'}
                        </span>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-primary-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Audio notifications sound only for active live alarms in your facility.
            </p>
          </div>

          {/* Warning Alarm Sound Profile */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <label
                  htmlFor="warning-alarm-tune"
                  className="text-xs font-semibold text-slate-700 uppercase tracking-wider"
                >
                  Warning Alarms
                </label>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                  Warning
                </span>
              </div>
              <button
                type="button"
                onClick={() => handlePreview(preferences.warningAlarmSoundProfile)}
                disabled={previewingProfile !== null}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                  previewingProfile === preferences.warningAlarmSoundProfile
                    ? 'bg-amber-100 border-amber-300 text-amber-800'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs disabled:opacity-50'
                }`}
                title="Play an audible preview of the Warning alarm sound profile"
              >
                <Volume2
                  className={`w-3.5 h-3.5 ${
                    previewingProfile === preferences.warningAlarmSoundProfile
                      ? 'animate-bounce text-amber-600'
                      : 'text-slate-500'
                  }`}
                />
                <span>
                  {previewingProfile === preferences.warningAlarmSoundProfile
                    ? 'Playing...'
                    : 'Preview Warning'}
                </span>
              </button>
            </div>

            <select
              id="warning-alarm-tune"
              value={preferences.warningAlarmSoundProfile}
              onChange={(e) =>
                onUpdate({ warningAlarmSoundProfile: e.target.value as AlarmSoundProfileId })
              }
              disabled={!preferences.alarmSoundEnabled}
              className={`w-full px-3 py-2.5 bg-white border rounded-lg text-sm transition-all ${
                !preferences.alarmSoundEnabled
                  ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'text-slate-800 border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-primary-500 focus:border-transparent'
              }`}
            >
              {SOUND_PROFILES.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} — {profile.description}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {preferences.alarmSoundEnabled
                ? warningMeta?.cadenceDescription || ''
                : 'Turn Sound On to activate warning alarms.'}
            </p>
          </div>

          {/* Critical & Fatal Alarm Sound Profile */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-3.5 h-3.5 text-rose-500" />
                <label
                  htmlFor="critical-alarm-tune"
                  className="text-xs font-semibold text-slate-700 uppercase tracking-wider"
                >
                  Critical & Fatal Alarms
                </label>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">
                  Critical / Fatal
                </span>
              </div>
              <button
                type="button"
                onClick={() => handlePreview(preferences.criticalAlarmSoundProfile)}
                disabled={previewingProfile !== null}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                  previewingProfile === preferences.criticalAlarmSoundProfile
                    ? 'bg-rose-100 border-rose-300 text-rose-800'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs disabled:opacity-50'
                }`}
                title="Play an audible preview of the Critical alarm sound profile"
              >
                <Volume2
                  className={`w-3.5 h-3.5 ${
                    previewingProfile === preferences.criticalAlarmSoundProfile
                      ? 'animate-bounce text-rose-600'
                      : 'text-slate-500'
                  }`}
                />
                <span>
                  {previewingProfile === preferences.criticalAlarmSoundProfile
                    ? 'Playing...'
                    : 'Preview Critical'}
                </span>
              </button>
            </div>

            <select
              id="critical-alarm-tune"
              value={preferences.criticalAlarmSoundProfile}
              onChange={(e) => {
                const val = e.target.value as AlarmSoundProfileId;
                onUpdate({
                  criticalAlarmSoundProfile: val,
                  alarmSoundProfile: val, // Sync legacy field for backward compatibility
                });
              }}
              disabled={!preferences.alarmSoundEnabled}
              className={`w-full px-3 py-2.5 bg-white border rounded-lg text-sm transition-all ${
                !preferences.alarmSoundEnabled
                  ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'text-slate-800 border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-primary-500 focus:border-transparent'
              }`}
            >
              {SOUND_PROFILES.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} — {profile.description}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {preferences.alarmSoundEnabled
                ? criticalMeta?.cadenceDescription || ''
                : 'Turn Sound On to activate critical alarms.'}
            </p>
          </div>

          {/* Autoplay blocked notification */}
          {audioBlocked && (
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 animate-fade-in">
              <VolumeX className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Audio playback was restricted by browser autoplay policy. Click "Preview" again to grant audio permission.</span>
            </div>
          )}
        </div>
      </div>

      {/* Info Callout */}
      <div className="mt-6 pt-4 border-t border-slate-100 bg-slate-50/70 -mx-6 -mb-6 p-4 rounded-b-xl">
        <div className="flex items-start gap-2 text-xs text-slate-500">
          <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <span>
            Informational (<strong className="text-slate-700">INFO</strong>) events remain strictly visual and silent in accordance with industrial telemetry control standards.
          </span>
        </div>
      </div>
    </div>
  );
};
