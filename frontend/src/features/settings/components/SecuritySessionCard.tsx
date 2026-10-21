import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, KeyRound, LogOut, Clock } from 'lucide-react';
import { authStorage } from '../../auth/auth.storage';
import { formatDateTimeCustom } from '../settings.utils';
import type { UserPreferences } from '../settings.types';
import { useUserSettings } from '../hooks/useUserSettings';

interface SecuritySessionCardProps {
  onLogout: () => void;
  preferences: UserPreferences;
}

export const SecuritySessionCard: React.FC<SecuritySessionCardProps> = ({ onLogout, preferences }) => {
  const { resolvedTimezone } = useUserSettings();
  const expiresAt = authStorage.getExpiresAt();
  const [timeRemaining, setTimeRemaining] = useState<string>('--');
  const [isNearExpiry, setIsNearExpiry] = useState(false);

  useEffect(() => {
    if (!expiresAt) {
      setTimeRemaining('--');
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const diffMs = expiresAt - now;

      if (diffMs <= 0) {
        setTimeRemaining('Session Expired');
        setIsNearExpiry(true);
        return;
      }

      const totalMinutes = Math.floor(diffMs / (60 * 1000));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m remaining`);
      } else {
        setTimeRemaining(`${minutes}m remaining`);
      }

      setIsNearExpiry(diffMs < 30 * 60 * 1000); // Less than 30 mins
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 30 * 1000); // Tick every 30s
    return () => clearInterval(interval);
  }, [expiresAt]);

  const formattedExpiryDate = expiresAt
    ? formatDateTimeCustom(expiresAt, preferences.dateFormat, preferences.timeFormat, false, resolvedTimezone)
    : '--';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Security &amp; Session</h2>
            <p className="text-xs text-slate-500">Fixed 24-hour authentication session and credentials</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Session Expiry Monitor */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Active Session Expiry
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  isNearExpiry
                    ? 'bg-rose-100 text-rose-700 border border-rose-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                {timeRemaining}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Session deadline: <strong className="text-slate-800 font-medium">{formattedExpiryDate}</strong>
            </p>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Every authenticated session enforces an absolute 24-hour lifetime. Navigation and telemetry do not extend this deadline.
            </p>
          </div>

          {/* Password Action */}
          <div className="pt-2">
            <Link
              to="/change-password"
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors shadow-xs"
            >
              <KeyRound className="w-4 h-4" />
              Change Password
            </Link>
          </div>
        </div>
      </div>

      {/* Logout Action */}
      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-500">Terminate current session</span>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </div>
  );
};
