/*
  Warnings:

  - Added the required column `speciesSeed` to the `Coin` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Coin" ADD COLUMN     "speciesSeed" TEXT NOT NULL;
