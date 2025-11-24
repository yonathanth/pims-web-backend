-- AlterTable
ALTER TABLE "public"."batches" ADD COLUMN     "packsPerCarton" INTEGER,
ADD COLUMN     "unitsPerPack" INTEGER;

-- AlterTable
ALTER TABLE "public"."purchase_order_items" ADD COLUMN     "cartonQtyOrdered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cartonQtyReceived" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "packQtyOrdered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "packQtyReceived" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "packsPerCarton" INTEGER,
ADD COLUMN     "unitQtyOrdered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unitQtyReceived" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unitsPerPack" INTEGER;
