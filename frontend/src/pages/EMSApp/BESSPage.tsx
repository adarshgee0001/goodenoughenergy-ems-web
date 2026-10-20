import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardService } from '../../features/dashboard/dashboard.service';
import type { DashboardSite, DashboardBessAsset } from '../../features/dashboard/dashboard.types';
import { BatteryMedium, ChevronRight, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { usePreview } from '../../context/PreviewContext';
import { useUserSettings } from '../../features/settings/hooks/useUserSettings';

interface AssetWithSite extends DashboardBessAsset {
  site?: DashboardSite;
}

export default function BESSPage() {
  const { isPreviewing, previewClientId } = usePreview();
  const { preferences, formatEnergy } = useUserSettings();
  const [assets, setAssets] = useState<AssetWithSite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
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

        const sites = await dashboardService.getSites(clientId);
        
        const allAssetsArrays = await Promise.all(
          sites.map(async (site) => {
            try {
              const siteAssets = await dashboardService.getBessAssets(site.id);
              return siteAssets.map(asset => ({ ...asset, site }));
            } catch {
              return [];
            }
          })
        );
        
        const flattenedAssets = allAssetsArrays.flat();
        setAssets(flattenedAssets);
      } catch (err: any) {
        console.error('Failed to load BESS assets:', err);
        setError(err.message || 'Failed to load BESS assets.');
      } finally {
        setIsLoading(false);
      }
    }
    
    loadData();
  }, [isPreviewing, previewClientId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Loading BESS assets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Error Loading Assets</h1>
        <p className="text-slate-500 max-w-md">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">BESS Assets</h1>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
              <tr>
                <th className="px-6 py-4">Asset Name</th>
                <th className="px-6 py-4">Identifier</th>
                <th className="px-6 py-4">EMU Serial No.</th>
                <th className="px-6 py-4">Site</th>
                <th className="px-6 py-4 text-right">Capacity ({preferences.energyUnit})</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    No BESS assets found for your assigned sites.
                  </td>
                </tr>
              ) : (
                assets.map((asset) => {
                  return (
                    <tr key={asset.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                          <BatteryMedium className="w-4 h-4" />
                        </div>
                        {asset.name}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{asset.assetIdentifier}</td>
                      <td className="px-6 py-4 text-slate-600">{asset.emuId || '--'}</td>
                      <td className="px-6 py-4">
                        {asset.site ? (
                          <Link to={`/app/sites/${asset.site.id}`} className="text-primary-600 hover:text-primary-800 hover:underline flex items-center gap-1">
                            {asset.site.name} <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span className="text-slate-400">Unknown Site</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-700">
                        {formatEnergy(asset.energyCapacity).displayValue !== '--'
                          ? Number(formatEnergy(asset.energyCapacity).displayValue).toLocaleString()
                          : '--'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          Online
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link 
                          to={`/app/bess/${asset.id}`}
                          className="inline-flex items-center justify-center text-primary-600 hover:text-primary-800 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors font-medium"
                        >
                          Details <ChevronRight className="w-4 h-4 ml-1" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
