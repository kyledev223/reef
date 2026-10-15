-- CreateEnum
CREATE TYPE "CoinSource" AS ENUM ('COINGECKO_MEME', 'DEX_META');

-- CreateEnum
CREATE TYPE "CoinStatus" AS ENUM ('ACTIVE', 'SWIMMING_AWAY', 'DRIFTED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "Mood" AS ENUM ('CALM', 'FRENZY', 'SULKING');

-- CreateEnum
CREATE TYPE "SnapshotRes" AS ENUM ('M', 'H', 'D');

-- CreateEnum
CREATE TYPE "WorldEventKind" AS ENUM ('MOOD_CHANGE', 'ARRIVAL', 'SWIM_AWAY', 'RETURN', 'DRIFTED', 'SYSTEM');

-- CreateTable
CREATE TABLE "Coin" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "source" "CoinSource" NOT NULL,
    "status" "CoinStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusReason" TEXT,
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cgId" TEXT,
    "name" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "chain" TEXT,
    "address" TEXT,
    "platforms" JSONB,
    "metas" TEXT[],
    "lastSeenInMetaAt" TIMESTAMP(3),
    "logoSourceUrl" TEXT,
    "logoWebp" BYTEA,
    "logoFetchedAt" TIMESTAMP(3),
    "logoError" TEXT,
    "palette" TEXT[],
    "priceUsd" DOUBLE PRECISION,
    "marketCapUsd" DOUBLE PRECISION,
    "volume24hUsd" DOUBLE PRECISION,
    "change24hPct" DOUBLE PRECISION,
    "cgRank" INTEGER,
    "marketUpdatedAt" TIMESTAMP(3),
    "liquidityUsd" DOUBLE PRECISION,
    "dexVolume24hUsd" DOUBLE PRECISION,
    "dexPairCount" INTEGER,
    "pairCreatedAt" TIMESTAMP(3),
    "dexUpdatedAt" TIMESTAMP(3),
    "dexUnavailable" BOOLEAN NOT NULL DEFAULT false,
    "trackedRank" INTEGER,
    "speedPercentile" DOUBLE PRECISION,
    "mood" "Mood" NOT NULL DEFAULT 'CALM',
    "moodSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moodInitialized" BOOLEAN NOT NULL DEFAULT false,
    "trending" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "coinId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "res" "SnapshotRes" NOT NULL DEFAULT 'M',
    "priceUsd" DOUBLE PRECISION,
    "marketCapUsd" DOUBLE PRECISION,
    "volume24hUsd" DOUBLE PRECISION,
    "change24hPct" DOUBLE PRECISION,
    "liquidityUsd" DOUBLE PRECISION,
    "dexVolume24hUsd" DOUBLE PRECISION,

    CONSTRAINT "CoinSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceStatus" (
    "source" TEXT NOT NULL,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "nextAllowedAt" TIMESTAMP(3),

    CONSTRAINT "SourceStatus_pkey" PRIMARY KEY ("source")
);

-- CreateTable
CREATE TABLE "WorldEvent" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "WorldEventKind" NOT NULL,
    "coinId" TEXT,
    "message" TEXT NOT NULL,
    "data" JSONB,

    CONSTRAINT "WorldEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coin_key_key" ON "Coin"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Coin_cgId_key" ON "Coin"("cgId");

-- CreateIndex
CREATE INDEX "Coin_status_idx" ON "Coin"("status");

-- CreateIndex
CREATE INDEX "Coin_chain_address_idx" ON "Coin"("chain", "address");

-- CreateIndex
CREATE INDEX "CoinSnapshot_coinId_at_idx" ON "CoinSnapshot"("coinId", "at");

-- CreateIndex
CREATE INDEX "CoinSnapshot_res_at_idx" ON "CoinSnapshot"("res", "at");

-- CreateIndex
CREATE INDEX "WorldEvent_at_idx" ON "WorldEvent"("at");

-- AddForeignKey
ALTER TABLE "CoinSnapshot" ADD CONSTRAINT "CoinSnapshot_coinId_fkey" FOREIGN KEY ("coinId") REFERENCES "Coin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldEvent" ADD CONSTRAINT "WorldEvent_coinId_fkey" FOREIGN KEY ("coinId") REFERENCES "Coin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
