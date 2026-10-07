-- CreateTable
CREATE TABLE "TelemetrySnapshot15m" (
    "id" TEXT NOT NULL,
    "bessAssetId" TEXT NOT NULL,
    "bucketTimestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voltageA" DOUBLE PRECISION,
    "voltageB" DOUBLE PRECISION,
    "voltageC" DOUBLE PRECISION,
    "currentA" DOUBLE PRECISION,
    "currentB" DOUBLE PRECISION,
    "currentC" DOUBLE PRECISION,
    "totalPower" DOUBLE PRECISION,
    "pcsActivePower" DOUBLE PRECISION,
    "dcVoltage" DOUBLE PRECISION,
    "ambientTemp" DOUBLE PRECISION,
    "todayChargeEnergy" DOUBLE PRECISION,
    "todayDischargeEnergy" DOUBLE PRECISION,
    "accumChargeEnergy" DOUBLE PRECISION,
    "accumDischargeEnergy" DOUBLE PRECISION,
    "soc" DOUBLE PRECISION,
    "soh" DOUBLE PRECISION,
    "bmsCurrent" DOUBLE PRECISION,
    "cellVMax" DOUBLE PRECISION,
    "cellVMin" DOUBLE PRECISION,
    "cellTempMax" DOUBLE PRECISION,
    "gridSideLoad" DOUBLE PRECISION,

    CONSTRAINT "TelemetrySnapshot15m_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelemetrySnapshot15m_bessAssetId_bucketTimestamp_idx" ON "TelemetrySnapshot15m"("bessAssetId", "bucketTimestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TelemetrySnapshot15m_bessAssetId_bucketTimestamp_key" ON "TelemetrySnapshot15m"("bessAssetId", "bucketTimestamp");

-- AddForeignKey
ALTER TABLE "TelemetrySnapshot15m" ADD CONSTRAINT "TelemetrySnapshot15m_bessAssetId_fkey" FOREIGN KEY ("bessAssetId") REFERENCES "BESSAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
