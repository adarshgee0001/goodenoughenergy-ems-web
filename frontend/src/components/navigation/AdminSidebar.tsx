import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users } from 'lucide-react';

const navItems = [
  { name: 'Dashboard', path: '/admin', icon: LayoutDashboard, exact: true },
  { name: 'Clients', path: '/admin/clients', icon: Users, exact: false },
];

export function AdminSidebar({ isOpen, closeSidebar }: { isOpen: boolean; closeSidebar: () => void }) {
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
        <div className="h-16 flex items-center px-6 border-b border-slate-800 shrink-0 gap-3">
          <img
            src="/Favgee.png?v=2"
            alt="GoodEnough Energy Logo"
            className="h-7 w-auto object-contain shrink-0"
          />
          <span className="text-xl font-bold text-white tracking-tight">Admin Console</span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              end={item.exact}
              onClick={closeSidebar}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 ease-out font-medium text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-500
                ${isActive 
                  ? 'bg-primary-600 text-white shadow-xs' 
                  : 'hover:bg-slate-800 hover:text-white'}
              `}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {item.name}
            </NavLink>
          ))}
        </div>
        
        <div className="p-4 border-t border-slate-800 shrink-0 flex items-center justify-between text-xs text-slate-500">
          <span>v1.0.0 (Admin)</span>
          <img
            src="/Favgee.png"
            alt="GoodEnough Energy Logo"
            className="h-4 w-auto object-contain opacity-75 shrink-0"
          />
        </div>
      </aside>
    </>
  );
}
