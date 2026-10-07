import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TelemetryPoint } from '../../data/marketingTelemetry';

interface BatterySOCChartProps {
  data: TelemetryPoint[];
}

export function BatterySOCChart({ data }: BatterySOCChartProps) {
  return (
    <div className="w-full h-80 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-600 mb-4 ml-2">Battery SOC (%)</h3>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} domain={[0, 100]} />
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          />
          <Line type="monotone" dataKey="batterySOC" name="SOC (%)" stroke="#16a34a" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
