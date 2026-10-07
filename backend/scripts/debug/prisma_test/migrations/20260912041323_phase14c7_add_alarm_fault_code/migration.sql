-- AlterTable
ALTER TABLE "Alarm" ADD COLUMN     "faultCode" TEXT;

-- CreateIndex
CREATE INDEX "Alarm_deviceId_faultCode_idx" ON "Alarm"("deviceId", "faultCode");
