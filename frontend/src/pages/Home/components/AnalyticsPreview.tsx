import { KPICard } from '../../../components/ui/KPICard';
import { EnergyChart } from '../../../components/charts/EnergyChart';
import { BatterySOCChart } from '../../../components/charts/BatterySOCChart';
import { mockTelemetry } from '../../../data/marketingTelemetry';
import { Zap, Sun, Activity, ArrowDownToLine, ArrowUpRight } from 'lucide-react';

export function AnalyticsPreview() {
  return (
    <section className="py-24 bg-slate-50 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight sm:text-4xl mb-4">
            See Your Energy. <span className="text-primary-600">Understand Your Energy.</span>
          </h2>
          <p className="text-lg text-slate-600">
            Real-time telemetry and predictive insights at your fingertips.
          </p>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
          <KPICard title="Battery SOC" value="82%" icon={<Battery className="w-5 h-5" />} />
          <KPICard title="Solar Gen" value="184 kW" icon={<Sun className="w-5 h-5" />} />
          <KPICard title="Site Load" value="142 kW" icon={<Zap className="w-5 h-5" />} />
          <KPICard title="Grid Import" value="0 kW" icon={<ArrowDownToLine className="w-5 h-5" />} />
          <KPICard title="Peak Demand" value="118 kW" icon={<Activity className="w-5 h-5" />} />
          <KPICard title="Energy Saved" value="24.6 kWh" icon={<ArrowUpRight className="w-5 h-5" />} />
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-6">
          <EnergyChart data={mockTelemetry} />
          <BatterySOCChart data={mockTelemetry} />
        </div>
      </div>
    </section>
  );
}

// Ensure Battery icon is available
import { Battery } from 'lucide-react';
