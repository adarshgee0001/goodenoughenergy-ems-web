import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { EMSSidebar } from '../components/navigation/EMSSidebar';
import { EMSHeader } from '../components/navigation/EMSHeader';
import { usePreview } from '../context/PreviewContext';

export function EMSLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isPreviewing, previewClientName, exitPreview } = usePreview();
  const navigate = useNavigate();

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  const handleExitPreview = () => {
    exitPreview();
    navigate('/admin/clients', { replace: true });
  };

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
              className="text-xs font-semibold bg-indigo-500 hover:bg-indigo-400 text-white px-3 py-1 rounded transition-colors"
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
