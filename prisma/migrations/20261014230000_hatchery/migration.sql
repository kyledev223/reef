-- CreateEnum
CREATE TYPE "LaunchStatus" AS ENUM ('PREPARED', 'SUBMITTED', 'CONFIRMED', 'FAILED');

-- AlterEnum
BEGIN;
CREATE TYPE "CoinStatus_new" AS ENUM ('ACTIVE', 'HIDDEN');
ALTER TABLE "public"."Coin" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Coin" ALTER COLUMN "status" TYPE "CoinStatus_new" USING ("status"::text::"CoinStatus_new");
ALTER TYPE "CoinStatus" RENAME TO "CoinStatus_old";
ALTER TYPE "CoinStatus_new" RENAME TO "CoinStatus";
DROP TYPE "public"."CoinStatus_old";
ALTER TABLE "Coin" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "WorldEventKind_new" AS ENUM ('HATCH', 'MOOD_CHANGE', 'GRADUATED', 'SYSTEM');
ALTER TABLE "WorldEvent" ALTER COLUMN "kind" TYPE "WorldEventKind_new" USING ("kind"::text::"WorldEventKind_new");
ALTER TYPE "WorldEventKind" RENAME TO "WorldEventKind_old";
ALTER TYPE "WorldEventKind_new" RENAME TO "WorldEventKind";
DROP TYPE "public"."WorldEventKind_old";
COMMIT;

-- DropIndex
DROP INDEX "Coin_cgId_key";

-- DropIndex
DROP INDEX "Coin_chain_address_idx";

-- DropIndex
DROP INDEX "Coin_status_idx";

-- AlterTable
ALTER TABLE "Coin" DROP COLUMN "cgId",
DROP COLUMN "cgRank",
DROP COLUMN "dexUnavailable",
DROP COLUMN "lastSeenAt",
DROP COLUMN "lastSeenInMetaAt",
DROP COLUMN "logoError",
DROP COLUMN "logoFetchedAt",
DROP COLUMN "logoSourceUrl",
DROP COLUMN "metas",
DROP COLUMN "pairCreatedAt",
DROP COLUMN "platforms",
DROP COLUMN "source",
DROP COLUMN "trending",
DROP COLUMN "volume24hUsd",
ADD COLUMN     "change24hSource" TEXT,
ADD COLUMN     "creatorWallet" TEXT NOT NULL,
ADD COLUMN     "curveComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "curveUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "launchSignature" TEXT NOT NULL,
ADD COLUMN     "marketCapSol" DOUBLE PRECISION,
ADD COLUMN     "metadataUri" TEXT NOT NULL,
ADD COLUMN     "network" TEXT NOT NULL,
ADD COLUMN     "telegram" TEXT,
ADD COLUMN     "twitter" TEXT,
ADD COLUMN     "website" TEXT,
ALTER COLUMN "chain" SET NOT NULL,
ALTER COLUMN "chain" SET DEFAULT 'solana',
ALTER COLUMN "address" SET NOT NULL;

-- AlterTable
ALTER TABLE "CoinSnapshot" DROP COLUMN "change24hPct",
DROP COLUMN "volume24hUsd",
ADD COLUMN     "marketCapSol" DOUBLE PRECISION;

-- DropTable
DROP TABLE "TokenCheck";

-- DropEnum
DROP TYPE "CoinSource";

-- CreateTable
CREATE TABLE "Launch" (
    "id" TEXT NOT NULL,
    "status" "LaunchStatus" NOT NULL DEFAULT 'PREPARED',
    "error" TEXT,
    "wallet" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "ip" TEXT,
    "name" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "twitter" TEXT,
    "telegram" TEXT,
    "website" TEXT,
    "imagePng" BYTEA NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "metadataUri" TEXT NOT NULL,
    "metadataHost" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "messageB64" TEXT,
    "signature" TEXT,
    "submittedAt" TIMESTAMP(3),
    "coinId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Launch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletNonce" (
    "nonce" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "WalletNonce_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "WalletSession" (
    "tokenHash" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletSession_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "KeyValue" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeyValue_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Launch_mint_key" ON "Launch"("mint");

-- CreateIndex
CREATE UNIQUE INDEX "Launch_signature_key" ON "Launch"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "Launch_coinId_key" ON "Launch"("coinId");

-- CreateIndex
CREATE INDEX "Launch_wallet_createdAt_idx" ON "Launch"("wallet", "createdAt");

-- CreateIndex
CREATE INDEX "Launch_status_idx" ON "Launch"("status");

-- CreateIndex
CREATE INDEX "WalletSession_wallet_idx" ON "WalletSession"("wallet");

-- CreateIndex
CREATE INDEX "Coin_status_network_idx" ON "Coin"("status", "network");

-- CreateIndex
CREATE UNIQUE INDEX "Coin_network_address_key" ON "Coin"("network", "address");

-- AddForeignKey
ALTER TABLE "Launch" ADD CONSTRAINT "Launch_coinId_fkey" FOREIGN KEY ("coinId") REFERENCES "Coin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

