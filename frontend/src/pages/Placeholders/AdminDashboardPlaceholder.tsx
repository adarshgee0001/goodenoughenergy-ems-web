import { useAuth } from '../../hooks/useAuth';

export default function AdminDashboardPlaceholder() {
  const { logout, user } = useAuth();
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
      <h1 className="text-4xl font-bold mb-4 text-emerald-400">Admin Dashboard</h1>
      <p className="text-slate-400 mb-8 max-w-md">
        Welcome {user?.name}. This is a temporary placeholder for the Admin Dashboard. Role-based routing is working correctly!
      </p>
      <button 
        onClick={logout}
        className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-full font-medium transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}
