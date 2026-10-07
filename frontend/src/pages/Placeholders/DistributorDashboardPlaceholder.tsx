import { useAuth } from '../../hooks/useAuth';

export default function DistributorDashboardPlaceholder() {
  const { logout, user } = useAuth();
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 text-slate-900 p-6 text-center">
      <h1 className="text-4xl font-bold mb-4 text-primary-600">Distributor Portal</h1>
      <p className="text-slate-600 mb-8 max-w-md">
        Welcome {user?.name}. This is a temporary placeholder for the Distributor Dashboard. Role-based routing is working correctly!
      </p>
      <button 
        onClick={logout}
        className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-full font-medium transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}
