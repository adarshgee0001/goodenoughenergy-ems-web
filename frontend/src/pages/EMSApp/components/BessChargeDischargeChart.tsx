import { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { BatteryMedium } from 'lucide-react';
import type { PowerTrendPoint } from '../../../features/dashboard/dashboard.types';

interface BessChargeDischargeChartProps {
  data: PowerTrendPoint[];
  domain: [number, number];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const timeLabel = new Date(label).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    // Use the exact 2-minute source data for tooltips, decoupling it from the 10-minute rendered bars
    const dataPoint = payload[0].payload;
    
    return (
      <div className="bg-white p-3 border border-slate-200 shadow-md rounded-lg min-w-[180px]">
        <p className="text-sm font-bold text-slate-900 mb-2 border-b border-slate-100 pb-2">{timeLabel}</p>
        <div className="space-y-1.5">
          {dataPoint.sourceCharge !== null && dataPoint.sourceCharge !== undefined && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#2196F3' }} />
                <span className="text-sm font-medium text-slate-600">Charge</span>
              </div>
              <span className="text-sm font-bold text-slate-900">{Number(dataPoint.sourceCharge).toFixed(1)} kW</span>
            </div>
          )}
          {dataPoint.sourceDischarge !== null && dataPoint.sourceDischarge !== undefined && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#FF7A4D' }} />
                <span className="text-sm font-medium text-slate-600">Discharge</span>
              </div>
              <span className="text-sm font-bold text-slate-900">{Number(dataPoint.sourceDischarge).toFixed(1)} kW</span>
            </div>
          )}
          {dataPoint.soc !== null && dataPoint.soc !== undefined && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#7C4DFF' }} />
                <span className="text-sm font-medium text-slate-600">SOC</span>
              </div>
              <span className="text-sm font-bold text-slate-900">{Number(dataPoint.soc).toFixed(1)} %</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const renderSparseDot = (props: any) => {
  const { cx, cy, payload, index } = props;
  // Render a marker every 30 minutes (15 points at 2-min resolution) to keep chart clean
  if (index % 15 === 0 && payload.soc !== null) {
    return (
      <circle key={`dot-${index}`} cx={cx} cy={cy} r={3} fill="#fff" stroke="#7C4DFF" strokeWidth={2} />
    );
  }
  return null;
};

export const BessChargeDischargeChart = ({
  data,
  domain,
}: BessChargeDischargeChartProps) => {
  const hasData = data.length > 0;
  
  // Downsample/interpolate to strictly 2-minute resolution across the entire domain
  const transformedData = useMemo(() => {
    const sourceMs = 2 * 60 * 1000; // 2 minutes for source data (720 points)
    const barMs = 10 * 60 * 1000; // 10 minutes for visual bars (144 buckets)
    const startMs = Math.floor(domain[0] / sourceMs) * sourceMs;
    const endMs = Math.floor(domain[1] / sourceMs) * sourceMs;
    
    const timeline = new Map();
    const barBuckets = new Map();
    
    // 1. Initialize exact 2-minute timeline array
    for (let t = startMs; t <= endMs; t += sourceMs) {
      timeline.set(t, { chargeSum: 0, dischargeSum: 0, socSum: 0, powerCount: 0, socCount: 0 });
      
      const barTs = Math.floor(t / barMs) * barMs;
      if (!barBuckets.has(barTs)) {
        barBuckets.set(barTs, { chargeSum: 0, dischargeSum: 0, powerCount: 0 });
      }
    }
    
    // 2. Populate buckets from actual data
    data.forEach(pt => {
      // 2-minute source precision
      const sourceTs = Math.floor(pt.timestamp / sourceMs) * sourceMs;
      if (timeline.has(sourceTs)) {
        const b = timeline.get(sourceTs);
        if (pt.bess !== undefined && pt.bess !== null) {
          if (pt.bess > 0) b.chargeSum += pt.bess;
          if (pt.bess < 0) b.dischargeSum += pt.bess;
          b.powerCount++;
        }
        if (pt.soc !== undefined && pt.soc !== null) {
          b.socSum += pt.soc;
          b.socCount++;
        }
      }
      
      // 10-minute visual precision
      const barTs = Math.floor(pt.timestamp / barMs) * barMs;
      if (barBuckets.has(barTs)) {
        const bb = barBuckets.get(barTs);
        if (pt.bess !== undefined && pt.bess !== null) {
          if (pt.bess > 0) bb.chargeSum += pt.bess;
          if (pt.bess < 0) bb.dischargeSum += pt.bess;
          bb.powerCount++;
        }
      }
    });

    // 3. Map to chart array
    return Array.from(timeline.entries())
      .map(([ts, b]) => {
        // High-res 2-minute data
        const soc = b.socCount > 0 ? b.socSum / b.socCount : null;
        
        let sourceCharge = null;
        let sourceDischarge = null;
        if (b.powerCount > 0) {
          const avgSourceCharge = b.chargeSum / b.powerCount;
          const avgSourceDischarge = b.dischargeSum / b.powerCount;
          sourceCharge = avgSourceCharge > 0 ? avgSourceCharge : null;
          sourceDischarge = avgSourceDischarge < 0 ? avgSourceDischarge : null;
        }
        
        // Low-res 10-minute display data (placed exactly at the 10-min boundaries)
        let charge = null;
        let discharge = null;
        if (ts % barMs === 0 && barBuckets.has(ts)) {
          const bb = barBuckets.get(ts);
          if (bb.powerCount > 0) {
            const avgCharge = bb.chargeSum / bb.powerCount;
            const avgDischarge = bb.dischargeSum / bb.powerCount;
            charge = avgCharge > 0 ? avgCharge : null;
            discharge = avgDischarge < 0 ? avgDischarge : null;
          }
        }
        
        return {
          timestamp: ts,
          charge,
          discharge,
          soc,
          sourceCharge,
          sourceDischarge
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [data, domain]);

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

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full w-full">
      <div className="px-6 py-5 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-2">
          <BatteryMedium className="w-5 h-5 text-slate-500" />
          <h3 className="text-lg font-bold text-slate-900">BESS Charge vs Discharge</h3>
        </div>
        <div className="bg-blue-50 text-blue-600 text-xs font-semibold px-2.5 py-1 rounded-full border border-blue-100">
          AI Predicted
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col">
        {!hasData ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            No telemetry data available for the selected period.
          </div>
        ) : (
          <div className="flex-1 w-full min-h-[340px] flex flex-col">
            <h4 className="text-center font-bold text-[16px] text-slate-600 mb-2 mt-2">
              BESS Charge/Discharge (24h AI Forecast)
            </h4>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={transformedData} margin={{ top: 35, right: 20, left: 10, bottom: 20 }}>
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
                  label={{ value: 'Power (kW)', angle: 0, position: 'top', offset: 15, fill: '#64748b', fontSize: 12 }}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${value}`}
                  width={50}
                  domain={([dataMin, dataMax]: any) => {
                    const min = Math.min(dataMin || 0, 0);
                    const max = Math.max(dataMax || 0, 0);
                    const roundDown = Math.floor(min / 50) * 50;
                    const roundUp = Math.ceil(max / 50) * 50;
                    return [roundDown, Math.max(roundUp, 50)];
                  }}
                />
                
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  label={{ value: 'SOC (%)', angle: 0, position: 'top', offset: 15, fill: '#64748b', fontSize: 12 }}
                  domain={[0, 100]}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${value}%`}
                  width={40}
                />
                
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
                
                <Legend 
                  verticalAlign="top" 
                  align="center"
                  wrapperStyle={{ paddingBottom: '20px' }} 
                />

                <Bar
                  dataKey="discharge"
                  name="Discharge"
                  fill="#FF7A4D"
                  radius={[0, 0, 2, 2]}
                  isAnimationActive={false}
                  barSize={5}
                  stackId="power"
                  minPointSize={2}
                />
                
                <Bar
                  dataKey="charge"
                  name="Charge"
                  fill="#2196F3"
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                  barSize={5}
                  stackId="power"
                  minPointSize={2}
                />
                
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="soc"
                  name="SOC"
                  stroke="#7C4DFF"
                  strokeWidth={2}
                  dot={renderSparseDot}
                  activeDot={{ r: 5, strokeWidth: 0, fill: '#7C4DFF' }}
                  connectNulls={true}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};
