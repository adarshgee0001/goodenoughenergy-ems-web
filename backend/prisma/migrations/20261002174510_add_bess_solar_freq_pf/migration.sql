-- AlterTable
ALTER TABLE "TelemetryHistory" ADD COLUMN     "bessFrequency" DOUBLE PRECISION,
ADD COLUMN     "bessPowerFactor" DOUBLE PRECISION,
ADD COLUMN     "solarFrequency" DOUBLE PRECISION,
ADD COLUMN     "solarPowerFactor" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "TelemetrySnapshot15m" ADD COLUMN     "bessFrequency" DOUBLE PRECISION,
ADD COLUMN     "bessPowerFactor" DOUBLE PRECISION,
ADD COLUMN     "solarFrequency" DOUBLE PRECISION,
ADD COLUMN     "solarPowerFactor" DOUBLE PRECISION;
