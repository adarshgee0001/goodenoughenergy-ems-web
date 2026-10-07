import { useAuth } from '../../hooks/useAuth';
import { LogOut, User as UserIcon, Menu } from 'lucide-react';

export function EMSHeader({ toggleSidebar }: { toggleSidebar: () => void }) {
  const { user, role, logout } = useAuth();

  return (
    <header className="bg-white border-b border-slate-200 h-16 px-4 sm:px-6 flex items-center justify-between shrink-0 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900 hidden sm:block">GoodEnough Energy <span className="font-light text-slate-500">EMS</span></h1>
      </div>
      
      <div className="flex items-center gap-4">
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
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors flex items-center gap-2"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-medium hidden sm:block">Logout</span>
        </button>
      </div>
    </header>
  );
}
