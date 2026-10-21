import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { dashboardService } from '../../features/dashboard/dashboard.service';
import type { DashboardSite, DashboardBessAsset } from '../../features/dashboard/dashboard.types';
import { MapPin, BatteryMedium, Activity, ChevronRight, ChevronLeft, Loader2, AlertCircle } from 'lucide-react';
import { KPICard } from './components/EMSKPICard';
import { useUserSettings } from '../../features/settings/hooks/useUserSettings';

export default function SiteDetailsPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const { preferences, formatEnergy, formatPower, setActiveSiteTimezone } = useUserSettings();
  const [site, setSite] = useState<DashboardSite | null>(null);
  const [assets, setAssets] = useState<DashboardBessAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!siteId) return;
      try {
        setIsLoading(true);
        setError(null);
        
        // Use individual resource fetchers to get real DB data
        const fetchedSite = await dashboardService.getSite(siteId);
        const fetchedAssets = await dashboardService.getBessAssets(siteId);
        
        setSite(fetchedSite);
        setAssets(fetchedAssets);
      } catch (err: any) {
        console.error('Failed to load site details:', err);
        setError(err.message || 'Failed to load site details.');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [siteId]);

  useEffect(() => {
    if (site?.timezone) {
      setActiveSiteTimezone(site.timezone);
    }
  }, [site?.timezone, setActiveSiteTimezone]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Loading site details...</p>
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Error Loading Site</h1>
        <p className="text-slate-500 mb-6 max-w-md">{error || 'The site could not be found.'}</p>
        <Link to="/app/sites" className="inline-flex items-center text-primary-600 hover:text-primary-800 font-medium">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Sites
        </Link>
      </div>
    );
  }

  // Calculate static derived capacity from available assets
  const hasAnyEnergyCapacity = assets.some(asset => asset.energyCapacity !== null && asset.energyCapacity !== undefined);
  const hasAnyPowerRating = assets.some(asset => asset.powerRating !== null && asset.powerRating !== undefined);

  const totalEnergyCapacity = hasAnyEnergyCapacity 
    ? assets.reduce((sum, asset) => sum + (asset.energyCapacity || 0), 0)
    : null;

  const totalPowerRating = hasAnyPowerRating
    ? assets.reduce((sum, asset) => sum + (asset.powerRating || 0), 0)
    : null;

  const energyFormatted = formatEnergy(totalEnergyCapacity);
  const powerFormatted = formatPower(totalPowerRating);

  const isSingleBess = assets.length === 1;
  const isMultiBess = assets.length > 1;

  const energyCapacityTitle = isSingleBess ? 'Energy Capacity' : 'Total Energy Capacity';
  const powerRatingTitle = isSingleBess ? 'Power Rating' : 'Total Power Rating';

  const energyCapacitySubtitle = isMultiBess ? 'Sum of asset ratings' : undefined;
  const powerRatingSubtitle = isMultiBess ? 'Sum of asset ratings' : undefined;

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <Link to="/app/sites" className="hover:text-slate-900 transition-colors">Sites</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-slate-900 font-medium">{site.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">{site.name}</h1>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-emerald-100 text-emerald-800">
            Online
          </span>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard 
          title="Timezone" 
          value={site.timezone || '--'} 
          icon={<MapPin className="w-5 h-5" />} 
        />
        <KPICard
          title={energyCapacityTitle}
          value={energyFormatted.displayValue !== '--' ? `${Number(energyFormatted.displayValue).toLocaleString()} ${energyFormatted.unit}` : '--'}
          subtitle={energyCapacitySubtitle}
          icon={<BatteryMedium className="w-5 h-5" />}
        />
        <KPICard
          title={powerRatingTitle}
          value={powerFormatted.displayValue !== '--' ? `${Number(powerFormatted.displayValue).toLocaleString()} ${powerFormatted.unit}` : '--'}
          subtitle={powerRatingSubtitle}
          icon={<Activity className="w-5 h-5" />}
        />
      </div>

      {/* Associated BESS Assets */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Connected BESS Assets</h3>
          <p className="text-sm text-slate-500 mt-1">Energy storage systems deployed at this site.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
              <tr>
                <th className="px-6 py-4">Asset Name</th>
                <th className="px-6 py-4">Identifier</th>
                <th className="px-6 py-4">EMU Serial No.</th>
                <th className="px-6 py-4">Model</th>
                <th className="px-6 py-4 text-right">Capacity ({preferences.energyUnit})</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    No BESS assets assigned to this site.
                  </td>
                </tr>
              ) : (
                assets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                        <BatteryMedium className="w-4 h-4" />
                      </div>
                      {asset.name}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{asset.assetIdentifier}</td>
                    <td className="px-6 py-4 text-slate-600">{asset.emuId || '--'}</td>
                    <td className="px-6 py-4 text-slate-600">{asset.model || '--'}</td>
                    <td className="px-6 py-4 text-right text-slate-700">
                      {(() => {
                        const formatted = formatEnergy(asset.energyCapacity);
                        return formatted.displayValue !== '--' ? Number(formatted.displayValue).toLocaleString() : '--';
                      })()}
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
