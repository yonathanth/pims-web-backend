/*
  Warnings:

  - A unique constraint covering the columns `[name,phone]` on the table `suppliers` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `unitPrice` to the `batches` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."batches" ADD COLUMN     "unitPrice" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "public"."purchase_order_items" ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "manufactureDate" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_phone_key" ON "public"."suppliers"("name", "phone");
