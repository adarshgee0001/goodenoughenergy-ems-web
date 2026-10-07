import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardService } from '../../features/dashboard/dashboard.service';
import type { DashboardSite, DashboardBessAsset } from '../../features/dashboard/dashboard.types';
import { Map, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { usePreview } from '../../context/PreviewContext';

interface SiteWithAssets extends DashboardSite {
  assets: DashboardBessAsset[];
}

export default function SitesPage() {
  const { isPreviewing, previewClientId } = usePreview();
  const [sites, setSites] = useState<SiteWithAssets[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSites() {
      try {
        setIsLoading(true);
        setError(null);
        
        let clientId: string;
        
        if (isPreviewing && previewClientId) {
          clientId = previewClientId;
        } else {
          const clients = await dashboardService.getClients();
          if (!clients || clients.length === 0) {
            throw new Error('No client access available.');
          }
          clientId = clients[0].id;
        }

        const fetchedSites = await dashboardService.getSites(clientId);
        
        // Fetch BESS assets for each site to get the count
        const sitesWithAssets = await Promise.all(
          fetchedSites.map(async (site) => {
            try {
              const assets = await dashboardService.getBessAssets(site.id);
              return { ...site, assets };
            } catch {
              return { ...site, assets: [] };
            }
          })
        );

        setSites(sitesWithAssets);
      } catch (err: any) {
        console.error('Failed to load sites:', err);
        setError(err.message || 'Failed to load sites.');
      } finally {
        setIsLoading(false);
      }
    }

    loadSites();
  }, [isPreviewing, previewClientId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Loading sites...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Error Loading Sites</h1>
        <p className="text-slate-500 max-w-md">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Sites Overview</h1>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
              <tr>
                <th className="px-6 py-4">Site Name</th>
                <th className="px-6 py-4">Timezone</th>
                <th className="px-6 py-4 text-center">BESS Assets</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sites.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    No sites configured for this client.
                  </td>
                </tr>
              ) : (
                sites.map((site) => (
                  <tr key={site.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                        <Map className="w-4 h-4" />
                      </div>
                      {site.name}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{site.timezone || '--'}</td>
                    <td className="px-6 py-4 text-center font-medium text-slate-900">
                      {site.assets.length}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link 
                        to={`/app/sites/${site.id}`}
                        className="inline-flex items-center justify-center text-primary-600 hover:text-primary-800 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors font-medium"
                      >
                        View Details <ChevronRight className="w-4 h-4 ml-1" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
