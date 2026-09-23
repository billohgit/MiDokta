// Simulates a text message arriving from a phone, so the reply-into-chat flow can be exercised
// locally without any SMS provider. Usage:
//   npm run sms:reply -- "+23276777888" "Yes doctor, I will come tomorrow."
// Reads SMS_WEBHOOK_SECRET from the environment or .env; APP_URL defaults to http://localhost:3000.
import fs from "fs";

function fromEnvFile(name) {
  try {
    const match = fs.readFileSync(new URL("../.env", import.meta.url), "utf8").match(new RegExp(`^${name}="?([^"\n]*)"?`, "m"));
    return match?.[1];
  } catch {
    return undefined;
  }
}

const [from, ...rest] = process.argv.slice(2);
const body = rest.join(" ");
if (!from || !body) {
  console.error('Usage: npm run sms:reply -- "<phone number>" "<message>"');
  process.exit(1);
}

const secret = process.env.SMS_WEBHOOK_SECRET ?? fromEnvFile("SMS_WEBHOOK_SECRET");
const baseUrl = process.env.APP_URL ?? fromEnvFile("APP_URL") ?? "http://localhost:3000";
if (!secret) {
  console.error("SMS_WEBHOOK_SECRET is not set");
  process.exit(1);
}

// The same shape SMS Gateway for Android posts, so this exercises the real webhook path.
const res = await fetch(`${baseUrl}/api/sms/inbound?token=${encodeURIComponent(secret)}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    event: "sms:received",
    payload: { messageId: `local-${Date.now()}`, message: body, phoneNumber: from, simNumber: 1, receivedAt: new Date().toISOString() },
  }),
});

if (!res.ok) {
  console.error(`${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(`Delivered from ${from}: "${body}"`);
console.log("Open Chat, or Admin -> SMS, to see it. An unknown number is logged as skipped.");
