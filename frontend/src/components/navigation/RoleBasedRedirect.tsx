import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePreview } from '../../context/PreviewContext';

export function RoleBasedRedirect() {
  const { isAuthenticated, role, user } = useAuth();
  const { isPreviewing } = usePreview();
  
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role === 'ADMIN') {
    if (isPreviewing) {
      return <Navigate to="/app" replace />;
    }
    return <Navigate to="/admin" replace />;
  }
  if (role === 'DISTRIBUTOR') return <Navigate to="/distributor" replace />;
  if (role === 'CLIENT') {
    if (user?.forcePasswordChange) {
      return <Navigate to="/change-password" replace />;
    }
    return <Navigate to="/app" replace />;
  }
  
  // Safe fallback for unknown/missing roles
  return <div className="p-8 text-center text-red-600 font-bold">Unauthorized Account Type</div>;
}
