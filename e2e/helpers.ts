import { Page } from "@playwright/test";
import { execSync } from "child_process";

const PROJECT_DIR =
  "/home/deathstar/2026/Projects/JanFebMarApr/Artilligence";
const DB_CMD = `docker compose exec -T db psql "postgresql://postgres:Krishnaisgod%40123%23@72.61.233.6:5432/artilligence_db" -t -A`;

export function dbQuery(sql: string): string {
  const escaped = sql.replace(/"/g, '\\"');
  const result = execSync(`${DB_CMD} -c "${escaped}" 2>&1`, {
    cwd: PROJECT_DIR,
    encoding: "utf-8",
  }).trim();
  // psql returns exit 0 even on errors — detect ERROR lines in output
  if (result.startsWith("ERROR:") || result.includes("\nERROR:")) {
    throw new Error(`SQL error: ${result}`);
  }
  return result;
}

// bcrypt hash of 'member123456' (generated offline, verified)
// Shell-escaped: $ → \$ since dbQuery passes SQL through shell double quotes
const MEMBER_PW_HASH =
  "\\$2b\\$12\\$F5IoN0XE1jXRqfkQZUOkTu7XF/C6Smg/clgs6z7ijVsDyyLi6VWM.";

export function ensureRootMember() {
  const exists = dbQuery(
    "SELECT COUNT(*) FROM users WHERE email='root@artilligence.com'"
  );
  if (parseInt(exists) === 0) {
    dbQuery(
      `INSERT INTO users (id, email, password_hash, name, phone, role, referral_code, depth, path, status, has_completed_onboarding, created_at, updated_at)
       VALUES (gen_random_uuid(), 'root@artilligence.com', '${MEMBER_PW_HASH}', 'Rajesh Kumar', '+919999900001', 'MEMBER', 'ROOT01', 0, '/root', 'ACTIVE', true, NOW(), NOW())`
    );
    const rootId = dbQuery(
      "SELECT id FROM users WHERE email='root@artilligence.com'"
    );
    dbQuery(
      `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
       VALUES (gen_random_uuid(), '${rootId}', 0, 0, 0, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`
    );
  }
  // Always ensure password hash, onboarding flag, and language are correct
  dbQuery(
    `UPDATE users SET password_hash='${MEMBER_PW_HASH}', has_completed_onboarding=true, "preferredLanguage"='en' WHERE email='root@artilligence.com'`
  );
}

export function resetTestData() {
  // Clean ALL dependent tables in strict FK order (leaf → root)
  dbQuery("DELETE FROM audit_logs");
  dbQuery("DELETE FROM wallet_transactions");
  dbQuery("DELETE FROM commissions");
  dbQuery("DELETE FROM notifications");
  dbQuery("DELETE FROM sale_flags");
  dbQuery("DELETE FROM sale_items");
  dbQuery("DELETE FROM sales");
  // Delete non-seed wallets and users
  dbQuery(
    "DELETE FROM wallets WHERE user_id NOT IN (SELECT id FROM users WHERE email IN ('admin@artilligence.com','root@artilligence.com'))"
  );
  dbQuery(
    "DELETE FROM users WHERE email NOT IN ('admin@artilligence.com','root@artilligence.com')"
  );
  // Ensure root member exists (may have been deleted by previous test run)
  ensureRootMember();
  // Ensure seed users are ACTIVE and profile fields are reset
  dbQuery("UPDATE users SET status='ACTIVE'");
  dbQuery(`UPDATE users SET name='Rajesh Kumar', phone='+919999900001' WHERE email='root@artilligence.com'`);
  // Reset seed wallet balances to 0
  dbQuery("UPDATE wallets SET total_earned=0, pending=0, paid_out=0");
}

export async function resetRateLimiter() {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch("http://localhost:3005/api/dev/reset", { method: "POST" });
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForSelector('input[name="email"]', { timeout: 10000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

export async function registerMember(
  page: Page,
  referralCode: string,
  data: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }
) {
  await page.goto(`/join/${referralCode}`);
  await page.fill('input[name="name"]', data.name);
  await page.fill('input[name="email"]', data.email);
  await page.fill('input[name="phone"]', data.phone);
  await page.fill('input[name="password"]', data.password);
  await page.fill('input[name="confirmPassword"]', data.password);
  await page.click('button[type="submit"]');
}

export function blockMember(email: string) {
  dbQuery(`UPDATE users SET status='BLOCKED' WHERE email='${email}'`);
}

export function unblockMember(email: string) {
  dbQuery(`UPDATE users SET status='ACTIVE' WHERE email='${email}'`);
}

export function getMemberByEmail(email: string) {
  const row = dbQuery(
    `SELECT id, name, email, sponsor_id, parent_id, position, depth, referral_code, status FROM users WHERE email='${email}'`
  );
  if (!row) return null;
  const [id, name, em, sponsorId, parentId, position, depth, referralCode, status] =
    row.split("|");
  return {
    id,
    name,
    email: em,
    sponsorId,
    parentId,
    position: Number(position),
    depth: Number(depth),
    referralCode,
    status,
  };
}
