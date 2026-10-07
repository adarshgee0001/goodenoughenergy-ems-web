-- AlterTable
ALTER TABLE "BESSAsset" ADD COLUMN     "mqttTopic" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BESSAsset_mqttTopic_key" ON "BESSAsset"("mqttTopic");
