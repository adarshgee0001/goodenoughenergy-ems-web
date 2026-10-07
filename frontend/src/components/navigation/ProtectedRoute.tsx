import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePreview } from '../../context/PreviewContext';

interface ProtectedRouteProps {
  allowedRoles?: string[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, role, user } = useAuth();
  const { isPreviewing } = usePreview();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Admin in Preview mode should be allowed in CLIENT routes
  if (role === 'ADMIN' && isPreviewing && allowedRoles?.includes('CLIENT')) {
    // Proceed normally
  } else if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  // Prevent accessing protected routes (except /change-password itself if we allow it here)
  // if forcePasswordChange is true
  if (user?.forcePasswordChange && window.location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}
