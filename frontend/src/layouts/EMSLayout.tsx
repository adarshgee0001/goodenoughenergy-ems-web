import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { EMSSidebar } from '../components/navigation/EMSSidebar';
import { EMSHeader } from '../components/navigation/EMSHeader';
import { usePreview } from '../context/PreviewContext';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../context/WebSocketContext';
import { dashboardService } from '../features/dashboard/dashboard.service';
import type { DashboardContext } from '../features/dashboard/dashboard.types';

export function EMSLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isPreviewing, previewClientId, previewClientName, exitPreview } = usePreview();
  const { role } = useAuth();
  const { subscribeToSite, unsubscribeFromSite, isConnected } = useWebSocket();
  const navigate = useNavigate();

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  const handleExitPreview = () => {
    exitPreview();
    navigate('/admin/clients', { replace: true });
  };

  // Maintain continuous authorized site alarm subscription across all EMS subpages
  useEffect(() => {
    let cancelled = false;
    let activeSubscribedSiteId: string | null = null;

    async function subscribeFacilityAlarms() {
      try {
        let ctx: DashboardContext;
        if (role === 'ADMIN' && isPreviewing && previewClientId) {
          ctx = await dashboardService.resolvePreviewContext(previewClientId);
        } else {
          ctx = await dashboardService.resolveClientContext();
        }

        if (!cancelled && ctx?.site?.id) {
          activeSubscribedSiteId = ctx.site.id;
          subscribeToSite(ctx.site.id);
        }
      } catch (err) {
        console.warn('[EMSLayout] Could not resolve site context for continuous alarms:', err);
      }
    }

    if (isConnected) {
      subscribeFacilityAlarms();
    }

    return () => {
      cancelled = true;
      if (activeSubscribedSiteId) {
        unsubscribeFromSite(activeSubscribedSiteId);
      }
    };
  }, [role, isPreviewing, previewClientId, isConnected, subscribeToSite, unsubscribeFromSite]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans">
      <EMSSidebar isOpen={isSidebarOpen} closeSidebar={closeSidebar} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {isPreviewing && (
          <div className="bg-indigo-600 text-white px-4 py-2 flex items-center justify-between shadow-md z-50">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide bg-indigo-800 px-2 py-0.5 rounded text-indigo-100">ADMIN PREVIEW</span>
              <span className="text-sm font-medium">Viewing: {previewClientName}</span>
            </div>
            <button
              onClick={handleExitPreview}
              className="text-xs font-semibold bg-indigo-500 hover:bg-indigo-400 text-white px-3 py-1 rounded transition-colors duration-150 ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
            >
              Exit Preview
            </button>
          </div>
        )}
        <EMSHeader toggleSidebar={toggleSidebar} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
