// Bootstraps the shop and an admin in the LOCAL Firestore emulator only.
// Usage: npm run seed:emulator -- <uid> [admin|editor]
// The emulator accepts "Bearer owner", which bypasses rules. This never talks to production.

const [uid, role = "admin"] = process.argv.slice(2);
const project = process.env.FIREBASE_PROJECT || "demo-114-shop";
const shop = process.env.NEXT_PUBLIC_SHOP_ID || "shop-114";
const host = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

if (!uid) {
  console.error("Usage: npm run seed:emulator -- <uid> [admin|editor]");
  console.error("Sign in once at http://localhost:3000 with the emulator running; the app shows your UID.");
  process.exit(1);
}
if (!project.startsWith("demo-")) {
  console.error(`Refusing to seed project "${project}": only demo-* emulator projects are allowed.`);
  process.exit(1);
}

const base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;

async function put(path, fields) {
  const res = await fetch(`${base}/${path}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
}

await put(`shops/${shop}`, { name: { stringValue: "Room 114 shop" }, activeLayoutId: { stringValue: "main" } });
await put(`shops/${shop}/members/${uid}`, { role: { stringValue: role } });
console.log(`Emulator: ${uid} is now ${role} of ${shop}. Reload the app and use "Create draft layout".`);
