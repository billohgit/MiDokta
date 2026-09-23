// Triggers the scheduled SMS job once. Use with Windows Task Scheduler / cron, e.g. every 15 minutes:
//   node scripts/run-sms-cron.mjs
// Reads CRON_SECRET from the environment or .env; APP_URL defaults to http://localhost:3000.
import fs from "fs";

function fromEnvFile(name) {
  try {
    const match = fs.readFileSync(new URL("../.env", import.meta.url), "utf8").match(new RegExp(`^${name}="?([^"\\n]*)"?`, "m"));
    return match?.[1];
  } catch {
    return undefined;
  }
}

const secret = process.env.CRON_SECRET ?? fromEnvFile("CRON_SECRET");
const baseUrl = process.env.APP_URL ?? fromEnvFile("APP_URL") ?? "http://localhost:3000";
if (!secret) {
  console.error("CRON_SECRET is not set");
  process.exit(1);
}

const res = await fetch(`${baseUrl}/api/cron/sms`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
