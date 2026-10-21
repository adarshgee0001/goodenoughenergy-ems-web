export function resolveVoltageTrend(row: any) {
  // If gridOnState is 1, ensure it's not contradicted by gridOffState === 1
  const isGridActive = row.gridOnState === 1 && row.gridOffState !== 1;
  const isBessActive = row.gridOnState === 0 && row.gridOffState === 1;

  const baseResult = {
    rawGridUab: row.gridVoltageUab,
    rawGridUbc: row.gridVoltageUbc,
    rawGridUca: row.gridVoltageUca,
    rawBessUa: row.bessVoltageUa,
    rawBessUb: row.bessVoltageUb,
    rawBessUc: row.bessVoltageUc,
  };

  if (isGridActive) {
    return {
      activeSource: 'GRID',
      gridUab: row.gridVoltageUab,
      gridUbc: row.gridVoltageUbc,
      gridUca: row.gridVoltageUca,
      bessUa: 0,
      bessUb: 0,
      bessUc: 0,
      ...baseResult
    };
  } else if (isBessActive) {
    return {
      activeSource: 'BESS',
      gridUab: 0,
      gridUbc: 0,
      gridUca: 0,
      bessUa: row.bessVoltageUa,
      bessUb: row.bessVoltageUb,
      bessUc: row.bessVoltageUc,
      ...baseResult
    };
  } else {
    // Both states are missing, null, invalid, or unexpected.
    // Business rule: output communicates unknown/missing values as 0 but retains raw measurements in diagnostic fields.
    return {
      activeSource: 'UNKNOWN',
      gridUab: 0,
      gridUbc: 0,
      gridUca: 0,
      bessUa: 0,
      bessUb: 0,
      bessUc: 0,
      ...baseResult
    };
  }
}

export class VoltageTrendProcessor {
  private lastOn: number | null | undefined = undefined;
  private lastOff: number | null | undefined = undefined;
  private lastTimestamp: number | null = null;
  private readonly MAX_FRESHNESS_MS = 6 * 60 * 1000; // 6 minutes covers the 5-minute full packet interval

  public setInitialState(lastOn: number | null | undefined, lastOff: number | null | undefined, lastTimestamp: number | null) {
    this.lastOn = lastOn;
    this.lastOff = lastOff;
    this.lastTimestamp = lastTimestamp;
  }

  public processRow(row: any) {
    const rowTime = row.timestamp instanceof Date ? row.timestamp.getTime() : new Date(row.timestamp).getTime();

    // Check freshness limit
    if (this.lastTimestamp !== null && Math.abs(rowTime - this.lastTimestamp) > this.MAX_FRESHNESS_MS) {
      this.lastOn = undefined;
      this.lastOff = undefined;
      this.lastTimestamp = null;
    }

    if (row.gridOnState != null || row.gridOffState != null) {
      this.lastOn = row.gridOnState;
      this.lastOff = row.gridOffState;
      this.lastTimestamp = rowTime;
    }

    const effectiveOn = row.gridOnState ?? this.lastOn;
    const effectiveOff = row.gridOffState ?? this.lastOff;

    const normalizedRow = {
      ...row,
      gridOnState: effectiveOn,
      gridOffState: effectiveOff,
    };

    return resolveVoltageTrend(normalizedRow);
  }
}
