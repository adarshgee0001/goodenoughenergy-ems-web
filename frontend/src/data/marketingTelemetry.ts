export interface TelemetryPoint {
  time: string;
  solar: number;
  load: number;
  gridImport: number;
  gridExport: number;
  batterySOC: number;
}

export const mockTelemetry: TelemetryPoint[] = [
  { time: '00:00', solar: 0, load: 120, gridImport: 120, gridExport: 0, batterySOC: 20 },
  { time: '04:00', solar: 0, load: 110, gridImport: 110, gridExport: 0, batterySOC: 20 },
  { time: '08:00', solar: 80, load: 140, gridImport: 60, gridExport: 0, batterySOC: 20 },
  { time: '10:00', solar: 184, load: 142, gridImport: 0, gridExport: 0, batterySOC: 40 },
  { time: '12:00', solar: 220, load: 150, gridImport: 0, gridExport: 0, batterySOC: 65 },
  { time: '14:00', solar: 210, load: 160, gridImport: 0, gridExport: 0, batterySOC: 82 }, // Current time state
  { time: '16:00', solar: 150, load: 155, gridImport: 0, gridExport: 0, batterySOC: 95 },
  { time: '18:00', solar: 40, load: 180, gridImport: 0, gridExport: 0, batterySOC: 85 },
  { time: '20:00', solar: 0, load: 200, gridImport: 0, gridExport: 0, batterySOC: 60 },
  { time: '24:00', solar: 0, load: 130, gridImport: 130, gridExport: 0, batterySOC: 40 },
];
