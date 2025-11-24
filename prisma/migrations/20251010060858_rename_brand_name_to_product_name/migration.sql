/*
  Warnings:

  - You are about to drop the column `brandName` on the `drugs` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."drugs" DROP COLUMN "brandName",
ADD COLUMN     "productName" TEXT;
