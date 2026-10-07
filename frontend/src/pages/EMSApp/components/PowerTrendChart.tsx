import { useState } from 'react';
import { Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, ReferenceLine } from 'recharts';
import type { PowerTrendPoint } from '../../../features/dashboard/dashboard.types';

interface PowerTrendChartProps {
  data: PowerTrendPoint[];
  title?: string;
  description?: string;
  domain: [number, number];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const timeLabel = new Date(label).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return (
      <div className="bg-white p-3 border border-slate-200 shadow-md rounded-lg min-w-[180px]">
        <p className="text-sm font-bold text-slate-900 mb-2 border-b border-slate-100 pb-2">{timeLabel}</p>
        <div className="space-y-1.5">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-sm font-medium text-slate-600">{entry.name}</span>
              </div>
              <span className="text-sm font-bold text-slate-900">
                {entry.value !== null && entry.value !== undefined ? `${Number(entry.value).toFixed(1)} ${entry.dataKey === 'soc' ? '%' : 'kW'}` : '--'}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const PowerTrendChart = ({
  data,
  title = 'Power Flow',
  description = 'Grid and battery power over the last 24 hours',
  domain,
}: PowerTrendChartProps) => {
  const hasData = data.length > 0;
  const [hoveredLine, setHoveredLine] = useState<string | null>(null);
  
  const durationMs = domain[1] - domain[0];
  const durationHours = durationMs / (1000 * 60 * 60);
  const durationDays = durationHours / 24;

  let tickIntervalHours = 1;
  if (durationHours <= 26) {
    tickIntervalHours = 1;
  } else if (durationDays <= 7) {
    tickIntervalHours = 12;
  } else if (durationDays <= 31) {
    tickIntervalHours = 24;
  } else {
    tickIntervalHours = 7 * 24;
  }

  const xTicks = [];
  const start = new Date(domain[0]);
  start.setMinutes(0, 0, 0);
  if (start.getTime() < domain[0]) {
    start.setHours(start.getHours() + 1);
  }
  
  for (let t = start.getTime(); t <= domain[1]; t += tickIntervalHours * 60 * 60 * 1000) {
    xTicks.push(t);
  }

  const handleLegendMouseEnter = (o: any) => {
    const { dataKey } = o;
    setHoveredLine(dataKey);
  };

  const handleLegendMouseLeave = () => {
    setHoveredLine(null);
  };

  const getLineOpacity = (dataKey: string) => {
    if (!hoveredLine) return 1;
    return hoveredLine === dataKey ? 1 : 0.3;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full w-full">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </div>

      {!hasData ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          No telemetry data available for the selected period.
        </div>
      ) : (
        <div className="flex-1 w-full min-h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
              <defs>
                <linearGradient id="colorGrid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#334155" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#334155" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorBess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#BFD730" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#BFD730" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorSolar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorSoc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              
              <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 4" strokeWidth={1} />
              
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={domain}
                ticks={xTicks}
                tickFormatter={(val) => {
                  const d = new Date(val);
                  if (durationDays > 7) {
                    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
                  } else if (durationDays > 2) {
                    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                  } else if (durationHours <= 26) {
                    const hours = d.getHours();
                    const ampm = hours >= 12 ? 'PM' : 'AM';
                    const hour12 = hours % 12 || 12;
                    const paddedHour = hour12 < 10 ? `0${hour12}` : hour12;
                    return `${paddedHour} ${ampm}`;
                  }
                  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }}
                interval={durationHours <= 26 ? 0 : "preserveEnd"}
                minTickGap={durationHours <= 26 ? 0 : 30}
                tick={
                  durationHours <= 26 
                    ? { fill: '#64748b', fontSize: 10, angle: -45, textAnchor: 'end' }
                    : { fill: '#64748b', fontSize: 12 }
                }
                tickMargin={durationHours <= 26 ? 4 : 12}
                height={durationHours <= 26 ? 50 : 30}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `${value}`}
                width={50}
                domain={([dataMin, dataMax]: any) => {
                  const maxAbs = Math.max(Math.abs(dataMin || 0), Math.abs(dataMax || 0));
                  // Add a minimum scale (e.g. 10) so it doesn't zoom in completely flat when everything is 0
                  const scale = Math.max(maxAbs, 10);
                  // Ensure nice rounded bounds
                  const rounded = Math.ceil(scale / 10) * 10;
                  return [-rounded, rounded];
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `${value}%`}
                width={40}
              />
              {/* Separate axis for large magnitude signals (Solar) to prevent squashing Grid/BESS */}
              <YAxis
                yAxisId="solar"
                hide={true}
                domain={[0, 'auto']}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }} />
              
              <Legend 
                verticalAlign="top" 
                align="center"
                wrapperStyle={{ paddingBottom: '20px' }} 
                iconType="circle" 
                onMouseEnter={handleLegendMouseEnter}
                onMouseLeave={handleLegendMouseLeave}
              />

              <Area
                type="monotone"
                dataKey="grid"
                name="Grid Power"
                stroke="#334155"
                fill="url(#colorGrid)"
                strokeWidth={2}
                strokeOpacity={getLineOpacity('grid')}
                fillOpacity={getLineOpacity('grid')}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: '#334155' }}
                connectNulls={false}
                isAnimationActive={false}
              />

              <Area
                type="monotone"
                dataKey="bess"
                name="BESS Power"
                stroke="#BFD730"
                fill="url(#colorBess)"
                strokeWidth={2}
                strokeOpacity={getLineOpacity('bess')}
                fillOpacity={getLineOpacity('bess')}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: '#BFD730' }}
                connectNulls={false}
                isAnimationActive={false}
              />

              <Area
                yAxisId="solar"
                type="monotone"
                dataKey="solar"
                name="Solar Power"
                stroke="#f59e0b"
                fill="url(#colorSolar)"
                strokeWidth={2}
                strokeOpacity={getLineOpacity('solar')}
                fillOpacity={getLineOpacity('solar')}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: '#f59e0b' }}
                connectNulls={false}
                isAnimationActive={false}
              />

              <Area
                yAxisId="right"
                type="monotone"
                dataKey="soc"
                name="SOC"
                stroke="#8b5cf6"
                fill="url(#colorSoc)"
                strokeWidth={2}
                strokeOpacity={getLineOpacity('soc')}
                fillOpacity={getLineOpacity('soc')}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: '#8b5cf6' }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};