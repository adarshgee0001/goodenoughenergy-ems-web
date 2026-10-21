import React from 'react';
import { User as UserIcon, Building2, ShieldCheck, Mail, Eye } from 'lucide-react';
import type { User } from '../../auth/auth.types';

interface AccountProfileCardProps {
  user: User | null;
  clientName?: string;
  siteName?: string;
  isPreviewing?: boolean;
}

export const AccountProfileCard: React.FC<AccountProfileCardProps> = ({
  user,
  clientName,
  siteName,
  isPreviewing = false,
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <UserIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Account &amp; Identity</h2>
            <p className="text-xs text-slate-500">
              {isPreviewing
                ? 'Platform administrator credentials and active preview context'
                : 'Authenticated user profile and organization assignment'}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* User Name */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <UserIcon className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">User Name</span>
                <span className="text-sm font-semibold text-slate-900">{user?.name || '--'}</span>
              </div>
            </div>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
              user?.role === 'ADMIN'
                ? 'bg-purple-100 text-purple-800 border-purple-200'
                : 'bg-primary-100 text-primary-800 border-primary-200'
            }`}>
              {user?.role || 'CLIENT'}
            </span>
          </div>

          {/* Email */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-2.5">
            <Mail className="w-4 h-4 text-slate-400" />
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Login Email</span>
              <span className="text-sm font-medium text-slate-800 break-all">{user?.email || '--'}</span>
            </div>
          </div>

          {/* Organization Scope */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-slate-400" />
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                {isPreviewing ? 'Account Scope' : 'Assigned Organization'}
              </span>
              <span className="text-sm font-medium text-slate-800">
                {isPreviewing ? 'Platform Administration (All Clients)' : (clientName || 'EMS Client Organization')}
              </span>
            </div>
          </div>

          {/* Active Preview Target Block (Only displayed when an admin is previewing a client) */}
          {isPreviewing && (
            <div className="p-3.5 bg-indigo-50/80 rounded-lg border border-indigo-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-bold text-indigo-700 tracking-wider flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-indigo-600" />
                  Active Preview Context
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded">
                  Client View
                </span>
              </div>
              <div className="text-xs text-indigo-950 font-medium space-y-1">
                <div className="flex justify-between">
                  <span className="text-indigo-600 text-[11px]">Previewing Client:</span>
                  <span className="font-bold text-indigo-900">{clientName || 'Selected Client'}</span>
                </div>
                {siteName && (
                  <div className="flex justify-between">
                    <span className="text-indigo-600 text-[11px]">Previewing Site:</span>
                    <span className="font-semibold text-indigo-800">{siteName}</span>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-indigo-600/90 mt-2 pt-1.5 border-t border-indigo-100">
                Display preferences configured here apply to your personal administrator profile.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-400 flex items-center gap-1.5">
        <ShieldCheck className={`w-3.5 h-3.5 ${isPreviewing ? 'text-indigo-500' : 'text-emerald-500'}`} />
        <span>
          {isPreviewing
            ? 'Administrator Session (Simulating Client Portal)'
            : 'Verified Corporate Account'}
        </span>
      </div>
    </div>
  );
};
