-- CreateTable
CREATE TABLE "public"."unit_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unit_types_name_key" ON "public"."unit_types"("name");

-- Seed default unit types
INSERT INTO "public"."unit_types" ("name", "description", "isActive", "createdAt", "updatedAt") VALUES
('STRIP', 'Strips', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('VIAL', 'Vials', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('AMPUL', 'Ampules', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('TABS', 'Tablets', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('UBS', 'Units', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ROLLS', 'Rolls', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PACK', 'Packs', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('BOX', 'Boxes', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('BOTTLE', 'Bottles', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('LITERS', 'Liters', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PCS', 'Pieces', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Add unitTypeId column to batches as nullable first
ALTER TABLE "public"."batches" ADD COLUMN "unitTypeId" INTEGER;

-- Add unitTypeId column to purchase_order_items as nullable first
ALTER TABLE "public"."purchase_order_items" ADD COLUMN "unitTypeId" INTEGER;

-- Get the first unit type ID (TABS) to use as default
DO $$
DECLARE
    default_unit_type_id INTEGER;
BEGIN
    SELECT id INTO default_unit_type_id FROM "public"."unit_types" WHERE "name" = 'TABS' LIMIT 1;
    
    -- Update existing batches to use default unit type
    UPDATE "public"."batches" SET "unitTypeId" = default_unit_type_id WHERE "unitTypeId" IS NULL;
    
    -- Update existing purchase_order_items to use default unit type
    UPDATE "public"."purchase_order_items" SET "unitTypeId" = default_unit_type_id WHERE "unitTypeId" IS NULL;
END $$;

-- Add foreign key constraints
ALTER TABLE "public"."batches" ADD CONSTRAINT "batches_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "public"."unit_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."purchase_order_items" ADD CONSTRAINT "purchase_order_items_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "public"."unit_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Make unitTypeId NOT NULL now that all rows have values
ALTER TABLE "public"."batches" ALTER COLUMN "unitTypeId" SET NOT NULL;

ALTER TABLE "public"."purchase_order_items" ALTER COLUMN "unitTypeId" SET NOT NULL;

