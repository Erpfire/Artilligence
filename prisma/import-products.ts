import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Image mapping: vm index -> image filename
const VM_TO_IMAGE: Record<number, string> = {
  1: "/products/xplore.png",
  2: "/products/drive.png",
  3: "/products/eko.png",
  4: "/products/eezy.png",
  5: "/products/inverter-gqp.png",
  6: "/products/home-invamaster.png",
  7: "/products/home-invatubular.png",
  8: "/products/inverter-magic.png",
  9: "/products/mileage.png",
  10: "/products/matrix.png",
  11: "/products/ride.png",
  12: "/products/home-star.png",
  13: "/products/xpress.png",
};

// Row -> vm (image) mapping from Excel metadata
const ROW_TO_VM: Record<number, number> = {
  2: 1, 3: 1, 4: 1, 5: 1, 6: 1,
  7: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 2, 13: 2,
  14: 3, 15: 3, 16: 3,
  17: 4, 18: 4, 19: 4, 20: 4, 21: 4,
  22: 5, 23: 5,
  24: 6, 25: 6, 26: 6, 27: 6,
  28: 7, 29: 7, 30: 7, 31: 7,
  32: 8,
  33: 9, 34: 9, 35: 9, 36: 9, 37: 9,
  38: 10, 39: 10,
  40: 11,
  41: 12, 42: 12, 43: 12, 44: 12,
  45: 1, 46: 1, 47: 1, 48: 1, 49: 1,
  50: 13, 51: 13, 52: 13, 53: 13, 54: 13, 55: 13,
};

interface ProductRow {
  row: number;
  name: string;
  warranty: string;
  ah: string;
  category: string;
  price: number;
  remark: string | null;
}

const PRODUCTS: ProductRow[] = [
  { row: 2, name: "12XL14L-A2", warranty: "24F+24P", ah: "14", category: "TWO-WHEELER", price: 3832, remark: null },
  { row: 3, name: "12XL2.5L-C", warranty: "24F+24P", ah: "2.5", category: "TWO-WHEELER", price: 1119, remark: null },
  { row: 4, name: "12XL5L-B", warranty: "24F+24P", ah: "5", category: "TWO-WHEELER", price: 1706, remark: null },
  { row: 5, name: "12XL7B-B", warranty: "24F+24P", ah: "7", category: "TWO-WHEELER", price: 1738, remark: null },
  { row: 6, name: "12XL9-B", warranty: "24+24P", ah: "9", category: "TWO-WHEELER", price: 2451, remark: null },
  { row: 7, name: "DRIVE100L", warranty: "18F+18P", ah: "100", category: "TRACTOR, LCV & HCV", price: 9006, remark: null },
  { row: 8, name: "DRIVE130R", warranty: "18F+18P", ah: "130", category: "HCV", price: 12235, remark: null },
  { row: 9, name: "DRIVE150R", warranty: "18F+18P", ah: "150", category: "HCV", price: 14618, remark: null },
  { row: 10, name: "DRIVE700R", warranty: "18F+18P", ah: "65", category: "CAR/SUV/TRACTOR", price: 7962, remark: null },
  { row: 11, name: "DRIVE80L", warranty: "18F+18P", ah: "80", category: "TRACTOR, LCV & HCV", price: 7701, remark: null },
  { row: 12, name: "DRIVE80R", warranty: "18F+18P", ah: "80", category: "TRACTOR, LCV & HCV", price: 7701, remark: null },
  { row: 13, name: "DRIVE88L", warranty: "18F+18P", ah: "88", category: "TRACTOR, LCV & HCV", price: 8244, remark: null },
  { row: 14, name: "EKO32", warranty: "24F", ah: "32", category: "3-WHEELER", price: 3861, remark: null },
  { row: 15, name: "EKO40L", warranty: "24F", ah: "40", category: "3-WHEELER & LCV", price: 4557, remark: null },
  { row: 16, name: "EKO60L", warranty: "24F", ah: "60", category: "3-WHEELER & LCV", price: 6513, remark: null },
  { row: 17, name: "EY700", warranty: "24F+24P", ah: "65", category: "CAR/SUV", price: 8835, remark: null },
  { row: 18, name: "EY700F", warranty: "24F+24P", ah: "65", category: "CAR/SUV", price: 8835, remark: null },
  { row: 19, name: "EY80D23R", warranty: "24F+24P", ah: "68", category: "CAR/SUV", price: 8835, remark: null },
  { row: 20, name: "EYDIN47RMFEFB", warranty: "24F+24P", ah: "47", category: "CAR/SUV", price: 7544, remark: null },
  { row: 21, name: "EYDIN52RMFEFB", warranty: "24F+24P", ah: "52", category: "CAR/SUV", price: 7901, remark: null },
  { row: 22, name: "GQP12V1125", warranty: "42M", ah: "1125VA", category: "INVERTER", price: 14179, remark: null },
  { row: 23, name: "GQP12V1450N", warranty: "42M", ah: "1450VA", category: "INVERTER", price: 18136, remark: null },
  { row: 24, name: "IMTT1500", warranty: "36F+24P", ah: "150", category: "INVERTER BATTERY", price: 21618, remark: null },
  { row: 25, name: "IMTT2000", warranty: "36F+24P", ah: "200", category: "INVERTER BATTERY", price: 28446, remark: null },
  { row: 26, name: "IMTT2200", warranty: "36F+24P", ah: "220", category: "INVERTER BATTERY", price: 31458, remark: null },
  { row: 27, name: "IMTT2500", warranty: "36F+24P", ah: "250", category: "INVERTER BATTERY", price: 34833, remark: null },
  { row: 28, name: "IT500", warranty: "48F+18P", ah: "500", category: "INVERTER BATTERY", price: 25659, remark: null },
  { row: 29, name: "IT750", warranty: "48F+18P", ah: "750", category: "INVERTER BATTERY", price: 34212, remark: null },
  { row: 30, name: "IT900", warranty: "48F+18P", ah: "900", category: "INVERTER BATTERY", price: 41055, remark: null },
  { row: 31, name: "IT950", warranty: "48F+18P", ah: "950", category: "INVERTER BATTERY", price: 44476, remark: null },
  { row: 32, name: "MAGIC12V1125", warranty: "42M", ah: "1125VA", category: "INVERTER", price: 7532, remark: null },
  { row: 33, name: "ML38B20L", warranty: "30F+30P", ah: "35", category: "CAR/SUV", price: 4929, remark: null },
  { row: 34, name: "ML38B20R", warranty: "30F+30P", ah: "35", category: "CAR/SUV", price: 4929, remark: null },
  { row: 35, name: "ML40LBH", warranty: "30F+30P", ah: "40", category: "CAR/SUV", price: 6039, remark: null },
  { row: 36, name: "MLDIN50", warranty: "30F+30P", ah: "50", category: "CAR/SUV", price: 7999, remark: null },
  { row: 37, name: "MLDIN60", warranty: "30F+30P", ah: "60", category: "CAR/SUV", price: 9374, remark: null },
  { row: 38, name: "MT40B20L", warranty: "36F+36P", ah: "35", category: "CAR/SUV", price: 5239, remark: null },
  { row: 39, name: "MT40B20R", warranty: "36F+36P", ah: "35", category: "CAR/SUV", price: 5239, remark: null },
  { row: 40, name: "RIDE700RF", warranty: "12F+12P", ah: "65", category: "CAR/SUV", price: 6313, remark: null },
  { row: 41, name: "STAR12V1125", warranty: "42M", ah: "1125VA", category: "INVERTER", price: 9744, remark: null },
  { row: 42, name: "STAR12V1375", warranty: "42M", ah: "1375VA", category: "INVERTER", price: 12037, remark: null },
  { row: 43, name: "STAR12V900", warranty: "42M", ah: "900VA", category: "INVERTER", price: 8598, remark: null },
  { row: 44, name: "STAR24V2550", warranty: "42M", ah: "2550VA", category: "INVERTER", price: 21016, remark: null },
  { row: 45, name: "XLTX14", warranty: "24F+24P", ah: "12", category: "TWO-WHEELER", price: 3429, remark: null },
  { row: 46, name: "XLTZ4A", warranty: "24F+24P", ah: "4", category: "TWO-WHEELER", price: 1310, remark: null },
  { row: 47, name: "XLTZ5A", warranty: "24F+24P", ah: "5", category: "TWO-WHEELER", price: 1546, remark: null },
  { row: 48, name: "XLTZ7", warranty: "24F+24P", ah: "6", category: "TWO-WHEELER", price: 1964, remark: null },
  { row: 49, name: "XLTZ9", warranty: "24+24P", ah: "9", category: "TWO-WHEELER", price: 2383, remark: null },
  { row: 50, name: "XP1000", warranty: "24F+18P", ah: "100", category: "HCV", price: 10961, remark: null },
  { row: 51, name: "XP1300", warranty: "24F+18P", ah: "130", category: "HCV", price: 13714, remark: null },
  { row: 52, name: "XP1500", warranty: "24F+18P", ah: "150", category: "HCV", price: 17554, remark: null },
  { row: 53, name: "XP800", warranty: "24F+18P", ah: "80", category: "LCV", price: 8728, remark: null },
  { row: 54, name: "XP800F", warranty: "24F+18P", ah: "80", category: "LCV", price: 8728, remark: null },
  { row: 55, name: "XP880", warranty: "24F+18P", ah: "88", category: "LCV", price: 9652, remark: null },
];

async function main() {
  console.log("Importing 54 products from MRPCATALOUGE.xlsx...\n");

  let created = 0;
  let skipped = 0;

  for (const p of PRODUCTS) {
    const imageUrl = VM_TO_IMAGE[ROW_TO_VM[p.row]] || null;

    // Skip if product with same name already exists
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    if (existing) {
      console.log(`  SKIP: ${p.name} (already exists)`);
      skipped++;
      continue;
    }

    await prisma.product.create({
      data: {
        name: p.name,
        price: p.price,
        category: p.category,
        imageUrl,
        warranty: p.warranty,
        ah: p.ah,
        remark: p.remark,
        sku: p.name, // use model name as SKU
        isActive: true,
      },
    });

    console.log(`  OK: ${p.name} (${p.category}, Rs.${p.price})`);
    created++;
  }

  console.log(`\nDone! Created: ${created}, Skipped: ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
