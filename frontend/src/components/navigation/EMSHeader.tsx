import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { LogOut, User as UserIcon, Menu, VolumeX, Check } from 'lucide-react';
import { useAlarmAudioState } from '../../features/settings/hooks/useAlarmAudioState';

export function EMSHeader({ toggleSidebar }: { toggleSidebar: () => void }) {
  const { user, role, logout } = useAuth();
  const { isAudioActive, severity, isSilenced, isAutoplayBlocked, silence } = useAlarmAudioState();
  const [showSilencedFeedback, setShowSilencedFeedback] = useState(false);

  useEffect(() => {
    if (isSilenced) {
      setShowSilencedFeedback(true);
      const timer = setTimeout(() => setShowSilencedFeedback(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [isSilenced]);

  return (
    <header className="bg-white border-b border-slate-200 h-16 px-4 sm:px-6 flex items-center justify-between shrink-0 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg lg:hidden transition-colors duration-150 ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2.5">
          <img
            src="/Favgee.png?v=2"
            alt="GoodEnough Energy Logo"
            className="h-8 w-auto object-contain shrink-0"
          />
          <h1 className="text-xl font-bold text-slate-900 hidden sm:block">GoodEnough Energy <span className="font-light text-slate-500">Storage.ai</span></h1>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Audio Alerts & Silence Sound Controls */}
        {isAudioActive && (
          <button
            type="button"
            onClick={silence}
            aria-label="Silence Sound"
            title="Silence currently sounding facility alarm (preserves active alarm state)"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors duration-150 ease-out shadow-sm animate-pulse focus:outline-hidden focus:ring-2 ${
              severity === 'CRITICAL'
                ? 'bg-rose-600 hover:bg-rose-700 text-white ring-rose-400 focus:ring-rose-500'
                : 'bg-amber-500 hover:bg-amber-600 text-white ring-amber-300 focus:ring-amber-400'
            }`}
          >
            <VolumeX className="w-4 h-4 shrink-0" />
            <span>Silence Sound</span>
          </button>
        )}

        {showSilencedFeedback && !isAudioActive && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200"
            role="status"
            aria-live="polite"
          >
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Sound Silenced</span>
          </div>
        )}

        {isAutoplayBlocked && (
          <div
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 text-xs border border-amber-200"
            title="Browser autoplay policy suspended audio. Click anywhere to activate alarm audio."
            role="alert"
          >
            <VolumeX className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Audio paused by browser. Click page to activate.</span>
          </div>
        )}

        <div className="hidden sm:block text-right">
          <p className="text-sm font-medium text-slate-900 leading-none mb-1">{user?.name}</p>
          <p className="text-xs text-slate-500 capitalize leading-none">{role}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 sm:hidden">
          <UserIcon className="w-4 h-4" />
        </div>
        <div className="h-6 w-px bg-slate-200 mx-2 hidden sm:block"></div>
        <button
          onClick={logout}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors duration-150 ease-out flex items-center gap-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-500"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-medium hidden sm:block">Logout</span>
        </button>
      </div>
    </header>
  );
}
