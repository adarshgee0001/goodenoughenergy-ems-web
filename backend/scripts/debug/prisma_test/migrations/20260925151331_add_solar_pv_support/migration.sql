-- Step 1: Add PV_INVERTER value to DeviceType enum
ALTER TYPE "DeviceType" ADD VALUE 'PV_INVERTER';

-- Step 2: Add solarPower column to TelemetryHistory
ALTER TABLE "TelemetryHistory" ADD COLUMN "solarPower" DOUBLE PRECISION;

-- Step 3: Add solarPower column to TelemetrySnapshot15m
ALTER TABLE "TelemetrySnapshot15m" ADD COLUMN "solarPower" DOUBLE PRECISION;
