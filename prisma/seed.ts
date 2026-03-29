import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 1. Create admin account
  const adminEmail = process.env.ADMIN_EMAIL || "admin@artilligence.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123456";
  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      name: "Admin",
      phone: "+910000000000",
      role: "ADMIN",
      referralCode: "ADMIN001",
      depth: 0,
      path: "/admin",
      status: "ACTIVE",
      hasCompletedOnboarding: true,
    },
  });
  console.log(`Admin: ${admin.email} (${admin.id})`);

  // 2. Create root member (first in the tree)
  const rootPassword = process.env.ROOT_PASSWORD || "member123456";
  const rootPasswordHash = await bcrypt.hash(rootPassword, 12);

  const root = await prisma.user.upsert({
    where: { email: "root@artilligence.com" },
    update: {},
    create: {
      email: "root@artilligence.com",
      passwordHash: rootPasswordHash,
      name: "Rajesh Kumar",
      phone: "+919999900001",
      role: "MEMBER",
      referralCode: "ROOT01",
      depth: 0,
      path: "/root",
      status: "ACTIVE",
      hasCompletedOnboarding: true,
    },
  });

  // Create wallet for root
  await prisma.wallet.upsert({
    where: { userId: root.id },
    update: {},
    create: { userId: root.id },
  });
  console.log(`Root member: ${root.email} (referral: ${root.referralCode})`);

  // 3. Default commission settings (7 levels)
  const rates = [
    { level: 1, percentage: 10.0 },
    { level: 2, percentage: 6.0 },
    { level: 3, percentage: 4.0 },
    { level: 4, percentage: 3.0 },
    { level: 5, percentage: 2.0 },
    { level: 6, percentage: 1.0 },
    { level: 7, percentage: 0.5 },
  ];

  for (const rate of rates) {
    await prisma.commissionSetting.upsert({
      where: { level: rate.level },
      update: { percentage: rate.percentage },
      create: { level: rate.level, percentage: rate.percentage },
    });
  }
  console.log("Commission settings: 7 levels created");

  // 4. Sample products (Exide batteries)
  const products = [
    {
      name: "Exide Inva Master IMTT 1500",
      nameHi: "एक्साइड इनवा मास्टर IMTT 1500",
      category: "Tubular",
      price: 14500.0,
      sku: "EX-IMTT-1500",
      description: "150Ah Tubular Battery for Inverter",
    },
    {
      name: "Exide Inva Master IMTT 1800",
      nameHi: "एक्साइड इनवा मास्टर IMTT 1800",
      category: "Tubular",
      price: 17500.0,
      sku: "EX-IMTT-1800",
      description: "180Ah Tubular Battery for Inverter",
    },
    {
      name: "Exide Instabrite IB 1500",
      nameHi: "एक्साइड इंस्टाब्राइट IB 1500",
      category: "Inverter",
      price: 13000.0,
      sku: "EX-IB-1500",
      description: "150Ah Flat Plate Battery for Inverter",
    },
    {
      name: "Exide Mileage ML 75D23L",
      nameHi: "एक्साइड माइलेज ML 75D23L",
      category: "Car",
      price: 6800.0,
      sku: "EX-ML-75D23L",
      description: "65Ah Car Battery",
    },
    {
      name: "Exide Xpress XP 800",
      nameHi: "एक्साइड एक्सप्रेस XP 800",
      category: "Car",
      price: 5500.0,
      sku: "EX-XP-800",
      description: "80Ah Car Battery for Commercial Vehicles",
    },
    {
      name: "Exide Bike Battery XLTZ 5",
      nameHi: "एक्साइड बाइक बैटरी XLTZ 5",
      category: "Bike",
      price: 1400.0,
      sku: "EX-XLTZ-5",
      description: "5Ah Bike Battery",
    },
    {
      name: "Exide PowerSafe EP 200-12",
      nameHi: "एक्साइड पावरसेफ EP 200-12",
      category: "SMF",
      price: 22000.0,
      sku: "EX-EP-200-12",
      description: "200Ah 12V SMF VRLA Battery",
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { sku: product.sku! },
      update: {},
      create: product,
    });
  }
  console.log(`Products: ${products.length} created`);

  // 5. App settings
  const settings = [
    { key: "daily_sale_limit", value: "10" },
    { key: "weekly_sale_limit", value: "50" },
    { key: "min_sale_gap_minutes", value: "5" },
    { key: "bill_code_format", value: "^MB-\\d{5,}$" },
  ];

  for (const setting of settings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }
  console.log("App settings: configured");

  console.log("\nSeed complete!");
  console.log(`Login as admin: ${adminEmail} / ${adminPassword}`);
  console.log(
    `Login as member: root@artilligence.com / ${rootPassword}`
  );
  console.log(
    `Register new members via: /join/${root.referralCode}`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
