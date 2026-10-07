-- DropIndex
DROP INDEX "Device_emuId_componentId_key";

-- AlterTable
ALTER TABLE "BESSAsset" ADD COLUMN     "emuId" TEXT;

-- AlterTable
ALTER TABLE "Device" DROP COLUMN "emuId";

-- CreateIndex
CREATE UNIQUE INDEX "BESSAsset_emuId_key" ON "BESSAsset"("emuId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_bessAssetId_componentId_key" ON "Device"("bessAssetId", "componentId");