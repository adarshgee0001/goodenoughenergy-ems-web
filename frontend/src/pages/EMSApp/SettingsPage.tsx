import { useState, useEffect } from 'react';
import { RotateCcw, Check, Eye } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePreview } from '../../context/PreviewContext';
import { useUserSettings } from '../../features/settings/hooks/useUserSettings';
import { DisplayPreferencesCard } from '../../features/settings/components/DisplayPreferencesCard';
import { SoundNotificationsCard } from '../../features/settings/components/SoundNotificationsCard';
import { ReportPreferencesCard } from '../../features/settings/components/ReportPreferencesCard';
import { AccountProfileCard } from '../../features/settings/components/AccountProfileCard';
import { SecuritySessionCard } from '../../features/settings/components/SecuritySessionCard';
import { dashboardService } from '../../features/dashboard/dashboard.service';
import type { DashboardContext } from '../../features/dashboard/dashboard.types';

export default function SettingsPage() {
  const { user, role, logout } = useAuth();
  const { isPreviewing, previewClientId, previewClientName } = usePreview();
  const { preferences, updatePreferences, resetPreferences, setActiveSiteTimezone, setActiveClientId } = useUserSettings();

  const [ctx, setCtx] = useState<DashboardContext | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadClientContext() {
      try {
        let resolved: DashboardContext;
        if (role === 'ADMIN' && isPreviewing && previewClientId) {
          resolved = await dashboardService.resolvePreviewContext(previewClientId);
        } else {
          resolved = await dashboardService.resolveClientContext();
        }
        if (!cancelled) {
          setCtx(resolved);
          if (resolved.site?.timezone) {
            setActiveSiteTimezone(resolved.site.timezone);
          }
          if (resolved.client?.id && setActiveClientId) {
            setActiveClientId(resolved.client.id);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          console.warn('[SettingsPage] Could not load full client context:', err);
          // Context is non-blocking for settings display preferences
        }
      }
    }

    loadClientContext();
    return () => {
      cancelled = true;
    };
  }, [role, isPreviewing, previewClientId, setActiveSiteTimezone, setActiveClientId]);

  const handleUpdatePreferences = (updates: any) => {
    updatePreferences(updates);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleResetPreferences = () => {
    if (window.confirm('Reset all display and report preferences to defaults?')) {
      resetPreferences();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard Settings</h1>
            {justSaved && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 animate-fade-in">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Configure your personal display units, reporting defaults, and review account security.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetPreferences}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
            title="Restore default display preferences"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            Reset to Defaults
          </button>
        </div>
      </div>

      {/* Admin Preview Mode Notification Banner */}
      {role === 'ADMIN' && isPreviewing && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-indigo-900 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700 mt-0.5 shrink-0">
              <Eye className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider bg-indigo-200/80 text-indigo-800 px-2 py-0.5 rounded">
                  Admin Preview Mode Active
                </span>
                <span className="text-sm font-semibold text-indigo-950">
                  Previewing: {ctx?.client?.name || previewClientName || 'Client'}
                  {ctx?.site?.name ? ` — ${ctx?.site?.name}` : ''}
                </span>
              </div>
              <p className="text-xs text-indigo-700/90 mt-1">
                You are currently simulating client access. Any display, unit, or reporting preferences configured below are saved to your personal administrator account (<span className="font-medium text-indigo-950">{user?.email}</span>) and will not modify client settings or stored telemetry.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: 3 columns on ultra-wide, 2 on desktop/laptop, 1 on mobile/tablet */}
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
        <DisplayPreferencesCard
          preferences={preferences}
          onUpdate={handleUpdatePreferences}
          bessAssets={ctx?.bessAssets}
        />

        <SoundNotificationsCard
          preferences={preferences}
          onUpdate={handleUpdatePreferences}
        />

        <ReportPreferencesCard
          preferences={preferences}
          onUpdate={handleUpdatePreferences}
        />

        <AccountProfileCard
          user={user}
          clientName={ctx?.client?.name || previewClientName || undefined}
          siteName={ctx?.site?.name}
          isPreviewing={role === 'ADMIN' && isPreviewing}
        />

        <SecuritySessionCard
          preferences={preferences}
          onLogout={logout}
        />
      </div>
    </div>
  );
}
