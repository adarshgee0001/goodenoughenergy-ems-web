import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { TelemetryPoint } from '../../data/mockTelemetry';

interface EnergyChartProps {
  data: TelemetryPoint[];
}

export function EnergyChart({ data }: EnergyChartProps) {
  return (
    <div className="w-full h-80 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-600 mb-4 ml-2">Energy Generation & Load (kW)</h3>
      <ResponsiveContainer width="100%" height="85%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorSolar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#BFD730" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#BFD730" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#414141" stopOpacity={0.1} />
              <stop offset="95%" stopColor="#414141" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
          <Area type="monotone" dataKey="solar" name="Solar (kW)" stroke="#BFD730" strokeWidth={2} fillOpacity={1} fill="url(#colorSolar)" />
          <Area type="step" dataKey="load" name="Load (kW)" stroke="#414141" strokeWidth={2} fillOpacity={1} fill="url(#colorLoad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
