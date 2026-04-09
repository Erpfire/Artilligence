import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// All 3 combo images — every combo gets these
const COMBO_IMAGES = [
  "/products/comboimages/combo2.jpeg", // 3:2 wide — hero image
  "/products/comboimages/combo1.jpeg", // 1:1 square
  "/products/comboimages/combo3.jpeg", // 1:1 square
];

// Individual products data from combo.xlsx — used to ensure they exist in DB
interface ProductData {
  name: string;
  description: string;
  mrp: number;
  ah: string;
  productType: string;
  warranty: string;
  fitment: string;
}

const ALL_PRODUCTS: ProductData[] = [
  { name: "12XL14L-A2", description: "12XL14L-A2 — XPLORE Two-Wheeler Battery", mrp: 3832, ah: "14AH", productType: "XPLORE", warranty: "24F+24P", fitment: "2 WHEELER" },
  { name: "12XL2.5L-C", description: "12XL2.5L-C — XPLORE Two-Wheeler Battery", mrp: 1119, ah: "2.5AH", productType: "XPLORE", warranty: "24F+24P", fitment: "2 WHEELER" },
  { name: "12XL5L-B", description: "12XL5L-B — XPLORE Two-Wheeler Battery", mrp: 1706, ah: "5AH", productType: "XPLORE", warranty: "24F+24P", fitment: "2 WHEELER" },
  { name: "12XL7B-B", description: "12XL7B-B — XPLORE Two-Wheeler Battery", mrp: 1738, ah: "7AH", productType: "XPLORE", warranty: "24F+24P", fitment: "2 WHEELER" },
  { name: "12XL9-B", description: "12XL9-B — XPLORE Two-Wheeler Battery", mrp: 2451, ah: "9AH", productType: "XPLORE", warranty: "24+24P", fitment: "2 WHEELER" },
  { name: "DRIVE130R", description: "DRIVE130R — DRIVE HCV Battery", mrp: 12235, ah: "130AH", productType: "DRIVE", warranty: "18F+18P", fitment: "CAR/SUV/3W/TRACTOR/CV" },
  { name: "DRIVE150R", description: "DRIVE150R — DRIVE HCV Battery", mrp: 14618, ah: "150AH", productType: "DRIVE", warranty: "18F+18P", fitment: "CAR/SUV/3W/TRACTOR/CV" },
  { name: "DRIVE700R", description: "DRIVE700R — DRIVE Car/SUV/Tractor Battery", mrp: 7962, ah: "65AH", productType: "DRIVE", warranty: "18F+18P", fitment: "CAR/SUV/3W/TRACTOR/CV" },
  { name: "DRIVE80L", description: "DRIVE80L — DRIVE Tractor/LCV/HCV Battery", mrp: 7701, ah: "80AH", productType: "DRIVE", warranty: "18F+18P", fitment: "CAR/SUV/3W/TRACTOR/CV" },
  { name: "DRIVE80R", description: "DRIVE80R — DRIVE Tractor/LCV/HCV Battery", mrp: 7701, ah: "80AH", productType: "DRIVE", warranty: "18F+18P", fitment: "CAR/SUV/3W/TRACTOR/CV" },
  { name: "DRIVE88L", description: "DRIVE88L — DRIVE Tractor/LCV/HCV Battery", mrp: 8244, ah: "88AH", productType: "DRIVE", warranty: "18F+18P", fitment: "CAR/SUV/3W/TRACTOR/CV" },
  { name: "DRIVE100L", description: "DRIVE100L — DRIVE Tractor/LCV/HCV Battery", mrp: 9006, ah: "100AH", productType: "DRIVE", warranty: "18F+18P", fitment: "CAR/SUV/3W/TRACTOR/CV" },
  { name: "EKO32", description: "EKO32 — EKO 3-Wheeler Battery", mrp: 3861, ah: "32AH", productType: "EKO", warranty: "24F", fitment: "3W/LCV" },
  { name: "EKO40L", description: "EKO40L — EKO 3-Wheeler/LCV Battery", mrp: 4557, ah: "35AH", productType: "EKO", warranty: "24F", fitment: "3W/LCV" },
  { name: "EKO60L", description: "EKO60L — EKO 3-Wheeler/LCV Battery", mrp: 6513, ah: "60AH", productType: "EKO", warranty: "24F", fitment: "3W/LCV" },
  { name: "EY700", description: "EY700 — EEZY Car/SUV Battery", mrp: 8835, ah: "65AH", productType: "EEZY", warranty: "24F+24P", fitment: "CAR/SUV" },
  { name: "EY700F", description: "EY700F — EEZY Car/SUV Battery", mrp: 8835, ah: "65AH", productType: "EEZY", warranty: "24F+24P", fitment: "CAR/SUV" },
  { name: "EY80D23R", description: "EY80D23R — EEZY Car/SUV Battery", mrp: 8835, ah: "68AH", productType: "EEZY", warranty: "24F+24P", fitment: "CAR/SUV" },
  { name: "EYDIN47RMFEFB", description: "EYDIN47RMFEFB — EEZY Car/SUV Battery", mrp: 7544, ah: "47AH", productType: "EEZY", warranty: "24F+24P", fitment: "CAR/SUV" },
  { name: "EYDIN52RMFEFB", description: "EYDIN52RMFEFB — EEZY Car/SUV Battery", mrp: 7901, ah: "52AH", productType: "EEZY", warranty: "24F+24P", fitment: "CAR/SUV" },
  { name: "GQP12V1125", description: "GQP12V1125 — DSP Cu Pure Sine Inverter", mrp: 14179, ah: "12V1125AH", productType: "DSP Cu Pure Sine", warranty: "42M", fitment: "INVERTER" },
  { name: "GQP12V1450N", description: "GQP12V1450N — MC Cu Pure Sine Inverter", mrp: 18136, ah: "12V1450NAH", productType: "MC Cu Pure Sine", warranty: "42M", fitment: "INVERTER" },
  { name: "IMTT1500", description: "IMTT1500 — Tall Tubular Inverter Battery", mrp: 22266, ah: "150AH", productType: "Tall Tubular", warranty: "36F+24P", fitment: "INVERTER BATTERY" },
  { name: "IMTT2000", description: "IMTT2000 — Tall Tubular Inverter Battery", mrp: 29300, ah: "200AH", productType: "Tall Tubular", warranty: "36F+24P", fitment: "INVERTER BATTERY" },
  { name: "IMTT2200", description: "IMTT2200 — Tall Tubular Inverter Battery", mrp: 32401, ah: "220AH", productType: "Tall Tubular", warranty: "36F+24P", fitment: "INVERTER BATTERY" },
  { name: "IMTT2500", description: "IMTT2500 — Tall Tubular Inverter Battery", mrp: 35878, ah: "250AH", productType: "Tall Tubular", warranty: "36F+24P", fitment: "INVERTER BATTERY" },
  { name: "IT500", description: "IT500 — Tall Tubular Inverter Battery", mrp: 26428, ah: "150AH", productType: "Tall Tubular", warranty: "48F+18P", fitment: "INVERTER BATTERY" },
  { name: "IT750", description: "IT750 — Tall Tubular Inverter Battery", mrp: 35238, ah: "200AH", productType: "Tall Tubular", warranty: "48F+18P", fitment: "INVERTER BATTERY" },
  { name: "IT900", description: "IT900 — Tall Tubular Inverter Battery", mrp: 42287, ah: "240AH", productType: "Tall Tubular", warranty: "48F+18P", fitment: "INVERTER BATTERY" },
  { name: "IT950", description: "IT950 — Tall Tubular Inverter Battery", mrp: 45810, ah: "260AH", productType: "Tall Tubular", warranty: "48F+18P", fitment: "INVERTER BATTERY" },
  { name: "MAGIC12V1125", description: "MAGIC12V1125 — MC Aluminium Inverter", mrp: 7758, ah: "12V1125AH", productType: "MC Aluminium", warranty: "42M", fitment: "INVERTER" },
  { name: "ML38B20L", description: "ML38B20L — Mileage Car/SUV Battery", mrp: 4929, ah: "35AH", productType: "MILEAGE", warranty: "30F+30P", fitment: "CAR/SUV" },
  { name: "ML38B20R", description: "ML38B20R — Mileage Car/SUV Battery", mrp: 4929, ah: "35AH", productType: "MILEAGE", warranty: "30F+30P", fitment: "CAR/SUV" },
  { name: "ML40LBH", description: "ML40LBH — Mileage Car/SUV Battery", mrp: 6039, ah: "40AH", productType: "MILEAGE", warranty: "30F+30P", fitment: "CAR/SUV" },
  { name: "MLDIN50", description: "MLDIN50 — Mileage Car/SUV Battery", mrp: 7999, ah: "50AH", productType: "MILEAGE", warranty: "30F+30P", fitment: "CAR/SUV" },
  { name: "MLDIN60", description: "MLDIN60 — Mileage Car/SUV Battery", mrp: 9374, ah: "60AH", productType: "MILEAGE", warranty: "30F+30P", fitment: "CAR/SUV" },
  { name: "MT40B20L", description: "MT40B20L — Matrix Car/SUV Battery", mrp: 5239, ah: "35AH", productType: "MATRIX", warranty: "36F+36P", fitment: "CAR/SUV" },
  { name: "MT40B20R", description: "MT40B20R — Matrix Car/SUV Battery", mrp: 5239, ah: "35AH", productType: "MATRIX", warranty: "36F+36P", fitment: "CAR/SUV" },
  { name: "RIDE700RF", description: "RIDE700RF — Ride Car/SUV Battery", mrp: 6313, ah: "65AH", productType: "RIDE", warranty: "12F+12P", fitment: "CAR/SUV" },
  { name: "STAR12V900", description: "STAR12V900 — MC Al Pure Sine Inverter", mrp: 8856, ah: "12V900AH", productType: "MC Al Pure Sine", warranty: "42M", fitment: "INVERTER" },
  { name: "STAR12V1125", description: "STAR12V1125 — MC Al Pure Sine Inverter", mrp: 10036, ah: "12V1125AH", productType: "MC Al Pure Sine", warranty: "42M", fitment: "INVERTER" },
  { name: "STAR12V1375", description: "STAR12V1375 — MC Al Pure Sine Inverter", mrp: 12398, ah: "12V1375AH", productType: "MC Al Pure Sine", warranty: "42M", fitment: "INVERTER" },
  { name: "STAR24V2550", description: "STAR24V2550 — MC Al Pure Sine Inverter", mrp: 21646, ah: "24V2550AH", productType: "MC Al Pure Sine", warranty: "42M", fitment: "INVERTER" },
  { name: "XP800", description: "XP800 — Xpress LCV Battery", mrp: 8728, ah: "80AH", productType: "XPRESS", warranty: "24F+18P", fitment: "LCV/HCV" },
  { name: "XP800F", description: "XP800F — Xpress LCV Battery", mrp: 8728, ah: "80AH", productType: "XPRESS", warranty: "24F+18P", fitment: "LCV/HCV" },
  { name: "XP880", description: "XP880 — Xpress LCV Battery", mrp: 9652, ah: "88AH", productType: "XPRESS", warranty: "24F+18P", fitment: "LCV/HCV" },
  { name: "XP1000", description: "XP1000 — Xpress HCV Battery", mrp: 10961, ah: "100AH", productType: "XPRESS", warranty: "24F+18P", fitment: "LCV/HCV" },
  { name: "XP1300", description: "XP1300 — Xpress HCV Battery", mrp: 13714, ah: "130AH", productType: "XPRESS", warranty: "24F+18P", fitment: "LCV/HCV" },
  { name: "XP1500", description: "XP1500 — Xpress HCV Battery", mrp: 17554, ah: "150AH", productType: "XPRESS", warranty: "24F+18P", fitment: "LCV/HCV" },
  { name: "XLTZ4A", description: "XLTZ4A — XPLORE Two-Wheeler Battery", mrp: 1310, ah: "4AH", productType: "XPLORE", warranty: "24F+24P", fitment: "2 WHEELER" },
  { name: "XLTZ5A", description: "XLTZ5A — XPLORE Two-Wheeler Battery", mrp: 1546, ah: "5AH", productType: "XPLORE", warranty: "24F+24P", fitment: "2 WHEELER" },
  { name: "XLTZ7", description: "XLTZ7 — XPLORE Two-Wheeler Battery", mrp: 1964, ah: "6AH", productType: "XPLORE", warranty: "24F+24P", fitment: "2 WHEELER" },
  { name: "XLTZ9", description: "XLTZ9 — XPLORE Two-Wheeler Battery", mrp: 2383, ah: "9AH", productType: "XPLORE", warranty: "24+24P", fitment: "2 WHEELER" },
  { name: "XLTX14", description: "XLTX14 — XPLORE Two-Wheeler Battery", mrp: 3429, ah: "12AH", productType: "XPLORE", warranty: "24F+24P", fitment: "2 WHEELER" },
  { name: "DRIVE100L", description: "DRIVE100L — DRIVE Tractor/LCV/HCV Battery", mrp: 9006, ah: "100AH", productType: "DRIVE", warranty: "18F+18P", fitment: "CAR/SUV/3W/TRACTOR/CV" },
];

// Combo definitions: product item codes for each combo
interface ComboDefinition {
  id: number;
  name: string;
  products: string[]; // item codes
}

const COMBOS: ComboDefinition[] = [
  { id: 1,  name: "PowerSync 1125",      products: ["GQP12V1125", "IMTT1500"] },
  { id: 2,  name: "StarVolt Essential",   products: ["IMTT1500", "STAR12V900"] },
  { id: 3,  name: "ThunderCore 2550",     products: ["IT950", "STAR24V2550"] },
  { id: 4,  name: "Mega Shield Pro",      products: ["IMTT2200", "STAR24V2550", "XLTZ4A", "XLTZ5A"] },
  { id: 5,  name: "StarVolt Pro",         products: ["IT500", "STAR12V900"] },
  { id: 6,  name: "Thunder Shield Max",   products: ["12XL14L-A2", "IT900", "STAR12V1125", "XLTZ4A"] },
  { id: 7,  name: "StarForce 1375",       products: ["IT950", "STAR12V1375"] },
  { id: 8,  name: "ThunderCore Titan",    products: ["IMTT2500", "STAR24V2550"] },
  { id: 9,  name: "MagicVolt 750",        products: ["IT750", "MAGIC12V1125"] },
  { id: 10, name: "PowerSync Elite",      products: ["GQP12V1450N", "IMTT2000", "XLTX14"] },
  { id: 11, name: "StarForce 1125",       products: ["IT950", "STAR12V1125"] },
  { id: 12, name: "ThunderCore 900",      products: ["IT900", "STAR24V2550"] },
  { id: 13, name: "StarForce Lite",       products: ["IT750", "STAR12V1375"] },
];

async function main() {
  console.log("=== Step 1: Importing individual products ===\n");

  // Deduplicate by name
  const seen = new Set<string>();
  const uniqueProducts = ALL_PRODUCTS.filter((p) => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });

  let created = 0;
  let skipped = 0;

  for (const p of uniqueProducts) {
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    if (existing) {
      // Update description if missing
      if (!existing.description) {
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            description: p.description,
            warranty: p.warranty,
            ah: p.ah,
            category: p.fitment,
          },
        });
        console.log(`  UPDATE: ${p.name} (added description)`);
      } else {
        console.log(`  SKIP: ${p.name} (exists)`);
      }
      skipped++;
      continue;
    }

    await prisma.product.create({
      data: {
        name: p.name,
        description: p.description,
        price: p.mrp,
        category: p.fitment,
        warranty: p.warranty,
        ah: p.ah,
        sku: p.name,
        isActive: true,
        isCombo: false,
      },
    });
    console.log(`  OK: ${p.name} (Rs.${p.mrp})`);
    created++;
  }

  console.log(`\nProducts — Created: ${created}, Skipped: ${skipped}\n`);

  console.log("=== Step 2: Creating combo products ===\n");

  let combosCreated = 0;
  let combosSkipped = 0;

  for (const combo of COMBOS) {
    const sku = `COMBO-${combo.id}`;

    // Skip if already exists
    const existing = await prisma.product.findFirst({ where: { sku } });
    if (existing) {
      console.log(`  SKIP: ${combo.name} (already exists)`);
      combosSkipped++;
      continue;
    }

    // Look up constituent products from DB
    const dbProducts = await prisma.product.findMany({
      where: { name: { in: combo.products } },
    });

    if (dbProducts.length !== combo.products.length) {
      const found = dbProducts.map((p) => p.name);
      const missing = combo.products.filter((n) => !found.includes(n));
      console.error(`  ERROR: ${combo.name} — missing products: ${missing.join(", ")}`);
      continue;
    }

    // Calculate total price from DB
    const totalPrice = dbProducts.reduce(
      (sum, p) => sum + Number(p.price),
      0
    );

    // Build description from DB product data
    const descriptionLines = dbProducts.map((p) => {
      const parts = [p.name];
      if (p.description) parts.push(p.description.split(" — ")[1] || "");
      if (p.ah) parts.push(p.ah);
      if (p.warranty) parts.push(`Warranty: ${p.warranty}`);
      return parts.filter(Boolean).join(" | ");
    });

    const description = `Combo includes:\n${descriptionLines.map((l) => `• ${l}`).join("\n")}`;

    await prisma.product.create({
      data: {
        name: combo.name,
        description,
        price: totalPrice,
        sku,
        category: "COMBO",
        imageUrl: COMBO_IMAGES[0], // primary image (3:2 wide)
        images: COMBO_IMAGES,
        warranty: null,
        ah: null,
        isCombo: true,
        isActive: true,
      },
    });

    console.log(`  OK: ${combo.name} (${combo.products.join(" + ")}) — Rs.${totalPrice.toLocaleString("en-IN")}`);
    combosCreated++;
  }

  console.log(`\nCombos — Created: ${combosCreated}, Skipped: ${combosSkipped}`);

  // Step 3: Create Custom Order product
  console.log("\n=== Step 3: Creating Custom Order product ===\n");
  const customSku = "COMBO-CUSTOM";
  const existingCustom = await prisma.product.findFirst({ where: { sku: customSku } });
  if (existingCustom) {
    console.log("  SKIP: Custom Order (already exists)");
  } else {
    await prisma.product.create({
      data: {
        name: "Custom Order",
        description: "A custom combo assembled by a field agent. Member enters the price and lists the included products.",
        price: 0,
        sku: customSku,
        category: "COMBO",
        imageUrl: COMBO_IMAGES[0],
        images: COMBO_IMAGES,
        isCombo: true,
        isActive: true,
      },
    });
    console.log("  OK: Custom Order");
  }

  console.log("\nDone!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
