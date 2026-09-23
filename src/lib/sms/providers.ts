import "server-only";

export type SendResult = { providerMessageId?: string };

export interface SmsProvider {
  name: string;
  /** True when messages actually reach phones (false for the development console provider). */
  live: boolean;
  /** True when replies can reach the inbound webhook, so patients can text back. */
  twoWay: boolean;
  send(to: string, body: string): Promise<SendResult>;
}

/** Logs messages instead of sending them. Default in development. */
const consoleProvider: SmsProvider = {
  name: "console",
  live: false,
  twoWay: false,
  async send(to, body) {
    console.log(`[sms:console] to ${to}: ${body}`);
    return {};
  },
};

/** A Messaging Service SID is "MG" followed by 32 hex characters. */
const isMessagingService = (from: string) => /^MG[0-9a-f]{32}$/i.test(from);

/** True for a real phone number or a Messaging Service, false for an alphanumeric sender ID. */
const isTwilioNumber = (from: string) => /^\+?[0-9\s()-]+$/.test(from) || isMessagingService(from);

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** https://www.twilio.com/docs/messaging/api/message-resource#create-a-message-resource */
const twilioProvider = (): SmsProvider => ({
  name: "twilio",
  live: true,
  // An alphanumeric sender ID such as "MiDokta" is send-only — there is no number to text
  // back. Replies only work from a real phone number or a Messaging Service.
  twoWay: isTwilioNumber(process.env.TWILIO_FROM ?? ""),
  async send(to, body) {
    const sid = required("TWILIO_ACCOUNT_SID");
    const token = required("TWILIO_AUTH_TOKEN");
    const from = required("TWILIO_FROM"); // phone number, alphanumeric sender, or Messaging Service SID (MG…)

    const form = new URLSearchParams({ To: to, Body: body });
    form.set(isMessagingService(from) ? "MessagingServiceSid" : "From", from);

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${data.message ?? res.statusText}`);
    return { providerMessageId: data.sid };
  },
});

/** https://developers.africastalking.com/docs/sms/sending/bulk */
const africasTalkingProvider = (): SmsProvider => ({
  name: "africastalking",
  live: true,
  twoWay: true,
  async send(to, body) {
    const username = required("AT_USERNAME");
    const apiKey = required("AT_API_KEY");
    const host = username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";

    const form = new URLSearchParams({ username, to, message: body });
    if (process.env.AT_SENDER_ID) form.set("from", process.env.AT_SENDER_ID);

    const res = await fetch(`https://${host}/version1/messaging`, {
      method: "POST",
      headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    const recipient = data?.SMSMessageData?.Recipients?.[0];
    if (!res.ok || !recipient || recipient.statusCode >= 400) {
      throw new Error(
        `Africa's Talking ${res.status}: ${recipient?.status ?? data?.SMSMessageData?.Message ?? res.statusText}`
      );
    }
    return { providerMessageId: recipient.messageId };
  },
});

/**
 * SMS Gateway for Android — https://docs.sms-gate.app
 *
 * An Android phone with a local SIM does the sending, so messages are ordinary person-to-person
 * texts at local rates and patients can text back. That matters in Sierra Leone, where
 * international A2P routes are send-only.
 *
 * `SMSGATE_BASE_URL` points at the public cloud relay by default; set it to a private server or
 * to the phone itself on the local network (`http://<phone-ip>:8080`).
 */
const smsGateProvider = (): SmsProvider => ({
  name: "smsgate",
  live: true,
  twoWay: true,
  async send(to, body) {
    const username = required("SMSGATE_USERNAME");
    const password = required("SMSGATE_PASSWORD");
    const base = (process.env.SMSGATE_BASE_URL || "https://api.sms-gate.app/3rdparty/v1").replace(/\/+$/, "");

    const res = await fetch(`${base}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ textMessage: { text: body }, phoneNumbers: [to] }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`SMS Gateway ${res.status}: ${data.message ?? data.error ?? res.statusText}`);

    // The phone reports delivery later; "Pending" here only means the gateway accepted it.
    const failed = data.recipients?.find((r: { state?: string; error?: string }) => r.error);
    if (failed) throw new Error(`SMS Gateway: ${failed.error}`);

    return { providerMessageId: data.id };
  },
});

/** The provider selected by SMS_PROVIDER (console | smsgate | twilio | africastalking). */
export function getSmsProvider(): SmsProvider {
  switch ((process.env.SMS_PROVIDER ?? "console").toLowerCase()) {
    case "smsgate":
      return smsGateProvider();
    case "twilio":
      return twilioProvider();
    case "africastalking":
      return africasTalkingProvider();
    default:
      return consoleProvider;
  }
}
