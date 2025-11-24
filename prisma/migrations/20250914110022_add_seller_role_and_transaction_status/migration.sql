-- AlterEnum
ALTER TYPE "public"."UserRole" ADD VALUE 'SELLER';

-- AlterTable
ALTER TABLE "public"."transactions" ADD COLUMN     "status" TEXT;
