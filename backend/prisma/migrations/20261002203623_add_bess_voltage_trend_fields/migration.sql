-- AlterTable
ALTER TABLE "TelemetryHistory" ADD COLUMN     "bessVoltageUa" DOUBLE PRECISION,
ADD COLUMN     "bessVoltageUb" DOUBLE PRECISION,
ADD COLUMN     "bessVoltageUc" DOUBLE PRECISION,
ADD COLUMN     "gridVoltageUab" DOUBLE PRECISION,
ADD COLUMN     "gridVoltageUbc" DOUBLE PRECISION,
ADD COLUMN     "gridVoltageUca" DOUBLE PRECISION;
