-- AlterTable
ALTER TABLE "BESSAsset" ADD COLUMN "reportIntervalMinutes" INTEGER NOT NULL DEFAULT 15;

-- Add check constraint for 1 to 20
ALTER TABLE "BESSAsset" ADD CONSTRAINT "chk_bess_report_interval" CHECK ("reportIntervalMinutes" >= 1 AND "reportIntervalMinutes" <= 20);
