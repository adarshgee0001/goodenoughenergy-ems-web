-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "componentId" TEXT,
ADD COLUMN     "emuId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Device_emuId_componentId_key" ON "Device"("emuId", "componentId");
