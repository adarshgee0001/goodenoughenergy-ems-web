import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { dashboardService } from '../../features/dashboard/dashboard.service';
import type { DashboardSite, DashboardBessAsset, DashboardDevice, DashboardTelemetryState } from '../../features/dashboard/dashboard.types';
import { BatteryMedium, Activity, Zap, ChevronRight, ChevronLeft, Cpu, Loader2, AlertCircle } from 'lucide-react';
import { useUserSettings } from '../../features/settings/hooks/useUserSettings';
import { KPICard } from './components/EMSKPICard';

export default function BESSAssetDetailsPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const { formatPower, formatEnergy, setActiveSiteTimezone } = useUserSettings();
  const [asset, setAsset] = useState<DashboardBessAsset | null>(null);
  const [site, setSite] = useState<DashboardSite | null>(null);
  const [devices, setDevices] = useState<DashboardDevice[]>([]);
  const [telemetry, setTelemetry] = useState<DashboardTelemetryState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Synchronize active site timezone with UserSettingsContext
  useEffect(() => {
    if (site?.timezone) {
      setActiveSiteTimezone(site.timezone);
    }
  }, [site?.timezone, setActiveSiteTimezone]);

  useEffect(() => {
    async function loadData() {
      if (!assetId) return;
      try {
        setIsLoading(true);
        setError(null);
        
        const fetchedAsset = await dashboardService.getBessAsset(assetId);
        setAsset(fetchedAsset);

        const fetchedSite = await dashboardService.getSite((fetchedAsset as any).siteId);
        setSite(fetchedSite);

        const fetchedDevices = await dashboardService.getDevices(assetId);
        setDevices(fetchedDevices);

        try {
          const telemetryRows = await dashboardService.getLatestTelemetry(fetchedSite.id);
          if (telemetryRows && telemetryRows.length > 0) {
            // Merge rows into a single telemetry state
            let merged: DashboardTelemetryState = {};
            const assetTelemetryRows = telemetryRows.filter(row => row.device.bessAssetId === assetId);
            for (const row of assetTelemetryRows) {
              if (row.device.type === 'PCS') {
                merged.bessPower = row.pcsActivePower ?? undefined;
                merged.pcsDcVoltage = row.dcVoltage ?? undefined;
                merged.pcsTemp = row.ambientTemp ?? undefined;
                merged.todayChargeEnergy = row.todayChargeEnergy ?? undefined;
                merged.todayDischargeEnergy = row.todayDischargeEnergy ?? undefined;
                merged.accChargeEnergy = row.accumChargeEnergy ?? undefined;
                merged.accDischargeEnergy = row.accumDischargeEnergy ?? undefined;
                merged.powerFactor = row.powerFactor ?? undefined;
                merged.bessPowerFactor = row.bessPowerFactor ?? undefined;
              }
              if (row.device.componentId === 'bcms') {
                merged.bessSoc = row.soc ?? undefined;
                merged.bmsSoh = row.soh ?? undefined;
                merged.bmsCurrent = row.bmsCurrent ?? undefined;
                merged.cellVMax = row.cellVMax ?? undefined;
                merged.cellVMin = row.cellVMin ?? undefined;
                merged.cellTempMax = row.cellTempMax ?? undefined;
              }
            }
            setTelemetry(merged);
          }
        } catch (telemetryErr) {
          console.warn('Telemetry could not be loaded:', telemetryErr);
        }
        
      } catch (err: any) {
        console.error('Failed to load asset details:', err);
        setError(err.message || 'Failed to load asset details.');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [assetId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Loading asset details...</p>
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Error Loading Asset</h1>
        <p className="text-slate-500 mb-6 max-w-md">{error || 'The asset could not be found.'}</p>
        <Link to="/app/bess" className="inline-flex items-center text-primary-600 hover:text-primary-800 transition-colors duration-150 ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-500 rounded font-medium">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Assets
        </Link>
      </div>
    );
  }

  const energyCapacityFmt = formatEnergy((asset as any)?.energyCapacity);
  const energyCapacityDisplay = energyCapacityFmt.displayValue !== '--'
    ? `${Number(energyCapacityFmt.displayValue).toLocaleString()} ${energyCapacityFmt.unit}`
    : '--';

  const powerRatingFmt = formatPower((asset as any)?.powerRating);
  const powerRatingDisplay = powerRatingFmt.displayValue !== '--'
    ? `${Number(powerRatingFmt.displayValue).toLocaleString()} ${powerRatingFmt.unit}`
    : '--';

  const activePowerFmt = formatPower(
    telemetry?.bessPower !== undefined && telemetry.bessPower !== null
      ? Math.abs(telemetry.bessPower)
      : undefined,
    4
  );
  const activePowerDisplay = activePowerFmt.displayValue !== '--'
    ? `${activePowerFmt.displayValue} ${activePowerFmt.unit}`
    : '--';

  const todayChargeFmt = formatEnergy(telemetry?.todayChargeEnergy);
  const todayDischargeFmt = formatEnergy(telemetry?.todayDischargeEnergy);
  const accChargeFmt = formatEnergy(telemetry?.accChargeEnergy);
  const accDischargeFmt = formatEnergy(telemetry?.accDischargeEnergy);

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          {site ? (
            <>
              <Link to={`/app/sites/${site.id}`} className="hover:text-slate-900 transition-colors">{site.name}</Link>
              <ChevronRight className="w-4 h-4" />
            </>
          ) : (
            <>
              <Link to="/app/bess" className="hover:text-slate-900 transition-colors">BESS Assets</Link>
              <ChevronRight className="w-4 h-4" />
            </>
          )}
          <span className="text-slate-900 font-medium">{asset.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">{asset.name}</h1>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-emerald-100 text-emerald-800">
            Online
          </span>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard
          title="Identifier"
          value={asset.assetIdentifier}
          icon={<BatteryMedium className="w-5 h-5" />}
        />
        <KPICard
          title="EMU Serial No."
          value={asset.emuId || '--'}
          icon={<Cpu className="w-5 h-5" />}
        />
        <KPICard
          title="Model"
          value={asset.model || '--'}
          icon={<Cpu className="w-5 h-5" />}
        />
        <KPICard
          title="Energy Capacity"
          value={energyCapacityDisplay}
          icon={<Zap className="w-5 h-5" />}
        />
        <KPICard
          title="Power Rating"
          value={powerRatingDisplay}
          icon={<Activity className="w-5 h-5" />}
        />
        <KPICard
          title="Parent Site"
          value={site ? site.name : 'Unknown'}
          icon={<ChevronRight className="w-5 h-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BMS Health Panel */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-900">BMS Health Panel</h3>
            <BatteryMedium className="w-5 h-5 text-slate-400" />
          </div>
          <div className="p-6 flex-1 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">State of Charge (SOC)</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{telemetry?.bessSoc ?? '--'}%</p>
              </div>
              <div className="w-16 h-16 rounded-full border-4 border-slate-200 flex items-center justify-center">
                <span className="font-bold text-slate-600">{telemetry?.bessSoc ?? '--'}%</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="text-xs font-medium text-slate-500">State of Health (SOH)</p>
                <p className="text-lg font-bold text-slate-900">{telemetry?.bmsSoh ?? '--'}%</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="text-xs font-medium text-slate-500">Battery Current</p>
                <p className="text-lg font-bold text-slate-900">{telemetry?.bmsCurrent ?? '--'} A</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="text-xs font-medium text-slate-500">Cell Voltage (Min/Max)</p>
                <p className="text-lg font-bold text-slate-900">{telemetry?.cellVMin ?? '--'} - {telemetry?.cellVMax ?? '--'} V</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="text-xs font-medium text-slate-500">Cell Max Temp</p>
                <p className="text-lg font-bold text-slate-900">{telemetry?.cellTempMax ?? '--'} °C</p>
              </div>
            </div>
          </div>
        </div>

        {/* PCS Operations Panel */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-900">PCS Operations Panel</h3>
            <Activity className="w-5 h-5 text-slate-400" />
          </div>
          <div className="p-6 flex-1 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Active Power</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">
                  {activePowerDisplay}
                </p>
              </div>
              <div className="text-right">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
                  telemetry?.bessPower !== undefined && telemetry.bessPower > 0 ? 'bg-blue-100 text-blue-800' :
                  telemetry?.bessPower !== undefined && telemetry.bessPower < 0 ? 'bg-amber-100 text-amber-800' :
                  'bg-slate-100 text-slate-800'
                }`}>
                  {telemetry?.bessPower !== undefined && telemetry.bessPower > 0 ? 'CHARGING ↑' : telemetry?.bessPower !== undefined && telemetry.bessPower < 0 ? 'DISCHARGING ↓' : 'IDLE'}
                </span>
                <p className="text-xs font-medium text-slate-500 mt-2">State: <span className="text-slate-900 font-bold">{telemetry?.pcsState ?? '--'}</span></p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="text-xs font-medium text-slate-500">DC Voltage</p>
                <p className="text-lg font-bold text-slate-900">{telemetry?.pcsDcVoltage ?? '--'} V</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="text-xs font-medium text-slate-500">Power Factor</p>
                <p className="text-lg font-bold text-slate-900">{telemetry?.bessPowerFactor != null ? telemetry.bessPowerFactor.toFixed(2) : '--'}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="text-xs font-medium text-slate-500">Temperature</p>
                <p className="text-lg font-bold text-slate-900">{telemetry?.pcsTemp ?? '--'} °C</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="text-xs font-medium text-slate-500">Today Charge/Discharge</p>
                <p className="text-lg font-bold text-slate-900">{todayChargeFmt.displayValue} / {todayDischargeFmt.displayValue} {todayChargeFmt.unit}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="text-xs font-medium text-slate-500">Acc Charge/Discharge</p>
                <p className="text-lg font-bold text-slate-900">{accChargeFmt.displayValue} / {accDischargeFmt.displayValue} {accChargeFmt.unit}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Device Hierarchy Structural Layout */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Device Hierarchy</h3>
            <p className="text-sm text-slate-500 mt-1">Structural representation of connected internal components.</p>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <BatteryMedium className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{asset.name}</p>
            </div>
          </div>
          
          <div className="ml-5 border-l-2 border-slate-200 pl-8 space-y-6">
            {devices.length === 0 ? (
              <p className="text-slate-500">No devices configured for this asset.</p>
            ) : (
              devices.map((device) => (
                <div key={device.id} className="relative">
                  {/* Connection line */}
                  <div className="absolute -left-8 top-1/2 w-8 border-t-2 border-slate-200"></div>
                  
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 shrink-0 shadow-sm">
                        <Cpu className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{device.name || device.componentId}</p>
                        <p className="text-xs text-slate-500 uppercase">{device.type}</p>
                      </div>
                    </div>
                    <div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        Online
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
