/*
  Warnings:

  - You are about to drop the column `productName` on the `drugs` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."drugs" DROP COLUMN "productName",
ADD COLUMN     "tradeName" TEXT;

-- AlterTable
ALTER TABLE "public"."locations" ALTER COLUMN "maxCapacity" SET DATA TYPE TEXT;
