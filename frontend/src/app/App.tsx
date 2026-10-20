import { Routes, Route, Navigate } from 'react-router-dom';
import { ScrollToTop } from '../layouts/ScrollToTop';

// Layout
import { EMSLayout } from '../layouts/EMSLayout';

// Pages
import LoginPage from '../pages/Login/LoginPage';
import DashboardPage from '../pages/EMSApp/DashboardPage';
import SitesPage from '../pages/EMSApp/SitesPage';
import SiteDetailsPage from '../pages/EMSApp/SiteDetailsPage';
import BESSPage from '../pages/EMSApp/BESSPage';
import BESSAssetDetailsPage from '../pages/EMSApp/BESSAssetDetailsPage';
import TelemetryPage from '../pages/EMSApp/TelemetryPage';
import AlarmsPage from '../pages/EMSApp/AlarmsPage';
import ReportsPage from '../pages/EMSApp/ReportsPage';
import ControlsPage from '../pages/EMSApp/ControlsPage';
import SettingsPage from '../pages/EMSApp/SettingsPage';

import { AuthProvider } from '../context/AuthContext';
import { ProtectedRoute } from '../components/navigation/ProtectedRoute';
import { RoleBasedRedirect } from '../components/navigation/RoleBasedRedirect';
import ChangePasswordPage from '../pages/ChangePassword/ChangePasswordPage';

// WebSocket
import { WebSocketProvider } from '../context/WebSocketContext';

// Admin Pages & Layout
import { AdminLayout } from '../layouts/AdminLayout';
import AdminDashboardPage from '../pages/Admin/AdminDashboardPage';
import ClientListPage from '../pages/Admin/ClientListPage';
import ClientDetailsPage from '../pages/Admin/ClientDetailsPage';
import AdminSiteDetailsPage from '../pages/Admin/SiteDetailsPage';
import AdminBessDetailsPage from '../pages/Admin/BessDetailsPage';

// Placeholders
import DistributorDashboardPlaceholder from '../pages/Placeholders/DistributorDashboardPlaceholder';

// Admin Preview
import { PreviewProvider } from '../context/PreviewContext';
import { UserSettingsProvider } from '../features/settings/context/UserSettingsContext';

function App() {
  return (
    <AuthProvider>
      <PreviewProvider>
        <UserSettingsProvider>
          <WebSocketProvider>
            <ScrollToTop />
          <Routes>
        {/* Root redirects based on role */}
        <Route path="/" element={<RoleBasedRedirect />} />
        
        {/* Login route */}
        <Route path="/login" element={<LoginPage />} />
        
        {/* Admin Route */}
        <Route path="/admin" element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="clients">
              <Route index element={<ClientListPage />} />
              <Route path=":clientId" element={<ClientDetailsPage />} />
              <Route path=":clientId/sites/:siteId" element={<AdminSiteDetailsPage />} />
              <Route path=":clientId/sites/:siteId/bess/:assetId" element={<AdminBessDetailsPage />} />
            </Route>
          </Route>
        </Route>

        {/* Distributor Route */}
        <Route path="/distributor" element={<ProtectedRoute allowedRoles={['DISTRIBUTOR']} />}>
          <Route index element={<DistributorDashboardPlaceholder />} />
        </Route>

        {/* Change Password Route (Protected, but allows forcePasswordChange) */}
        <Route path="/change-password" element={<ProtectedRoute allowedRoles={['CLIENT', 'ADMIN', 'DISTRIBUTOR']} />}>
          <Route index element={<ChangePasswordPage />} />
        </Route>

        {/* Protected EMS Routes (Client) */}
        <Route path="/app" element={<ProtectedRoute allowedRoles={['CLIENT']} />}>
          <Route element={<EMSLayout />}>
            <Route index element={<DashboardPage />} />
            
            <Route path="sites">
              <Route index element={<SitesPage />} />
              <Route path=":siteId" element={<SiteDetailsPage />} />
            </Route>

            <Route path="bess">
              <Route index element={<BESSPage />} />
              <Route path=":assetId" element={<BESSAssetDetailsPage />} />
            </Route>

            <Route path="telemetry" element={<TelemetryPage />} />
            <Route path="alarms" element={<AlarmsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="controls" element={<ControlsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* Catch-all route to handle old marketing routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
          </WebSocketProvider>
        </UserSettingsProvider>
      </PreviewProvider>
    </AuthProvider>
  );
}

export default App;
