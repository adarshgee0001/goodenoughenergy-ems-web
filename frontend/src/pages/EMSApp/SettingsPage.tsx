import { Settings } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-6">
        <Settings className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Settings Module</h1>
      <p className="text-slate-500 max-w-md">
        This module will be implemented in a later phase. It will provide application configuration, user preferences, and system settings.
      </p>
    </div>
  );
}
