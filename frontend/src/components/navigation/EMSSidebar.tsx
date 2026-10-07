import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Map, BatteryMedium, Activity, Bell, FileText, Settings, Sliders } from 'lucide-react';

const navItems = [
  { name: 'Dashboard', path: '/app', icon: LayoutDashboard, exact: true },
  { name: 'Sites', path: '/app/sites', icon: Map },
  { name: 'BESS Assets', path: '/app/bess', icon: BatteryMedium },
  { name: 'Telemetry', path: '/app/telemetry', icon: Activity },
  { name: 'Alarms & Events', path: '/app/alarms', icon: Bell },
  { name: 'Reports', path: '/app/reports', icon: FileText },
  { name: 'Controls', path: '/app/controls', icon: Sliders },
  { name: 'Settings', path: '/app/settings', icon: Settings },
];

export function EMSSidebar({ isOpen, closeSidebar }: { isOpen: boolean; closeSidebar: () => void }) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-20 bg-slate-900/50 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 text-slate-300 transition-transform duration-300 ease-in-out flex flex-col
        lg:static lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-16 flex items-center px-6 border-b border-slate-800 shrink-0">
          <span className="text-xl font-bold text-white tracking-tight">EMS Platform</span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              end={item.exact}
              onClick={closeSidebar}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors font-medium text-sm
                ${isActive 
                  ? 'bg-primary-600 text-white' 
                  : 'hover:bg-slate-800 hover:text-white'}
              `}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {item.name}
            </NavLink>
          ))}
        </div>
        
        <div className="p-4 border-t border-slate-800 shrink-0 text-xs text-slate-500">
          v1.0.0 (Phase 3)
        </div>
      </aside>
    </>
  );
}
