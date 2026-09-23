# Mi Dokta

Next.js (App Router) + PostgreSQL + Prisma hospital management system with an **admin portal**, a **doctor portal** and a **staff portal** for nurses, pharmacists and receptionists.

## Features

**Admin portal** (`/admin`)

- **Dashboard** — staff/patient/hospital counts, monthly revenue, calendar, upcoming appointments
- **Appointments** — incoming requests (accept/reject), scheduling, status tracking, one-click invoicing
- **Patients** — registration (email optional), medical info (blood group, allergies, chronic conditions, emergency contact), full profile with medical history, appointments and invoices
- **Doctors** — add/edit/deactivate, specialty, license, hospital, appointment history
- **Staff** — admins, nurses, pharmacists and receptionists (with safeguards: you can't deactivate yourself or remove the last admin)
- **Hospitals** — branches with contact details and staff/doctor/appointment counts
- **Pharmacy** — the stock list: medications, quantity on hand, reorder levels, deliveries, stock corrections and the movement ledger. Admins can also delete a medication that has never been dispensed
- **Billing** — invoices with line items, partial payments (cash, card, mobile money, bank transfer, insurance), balances, overdue flags, printable invoices, voiding
- **Notifications** — bell with unread count; alerts for requests, status changes, completed consultations and payments
- **Chat** — message anyone: staff in the app, patients by SMS (their text replies come back into the chat)
- **SMS** — delivery log of every text sent and received, retry failures, run reminders on demand
- **Settings** — profile, photo and SMS preference

**Doctor portal** (`/doctor`)

- **Dashboard** — today, requests, upcoming, completed and patient counts; personal calendar
- **Appointments** — accept open requests, consult, cancel
- **Consultations** — vitals, chief complaint, diagnosis, clinical notes, prescriptions, follow-up date; "Save & Complete Visit" notifies the front desk for billing and pharmacists of new prescriptions
- **Patients** — patients they have seen, with full medical history
- **Notifications** — including automatic reminders for confirmed appointments in the next 24 hours
- **Chat** — message staff and their own patients, one-to-one or in groups (patients receive messages by SMS)

**Staff portal** (`/staff`) — nurses, pharmacists and receptionists share one portal; the pages differ by role

- **Receptionist** — front desk: dashboard (today, requests, outstanding, collected today), full appointments (accept/reject requests, schedule, complete, cancel), patient registration and editing, billing (raise invoices, record payments)
- **Nurse** — dashboard, a day-by-day clinic **schedule** (with allergy flags), and read-only patient records
- **Pharmacist** — dashboard, a **prescriptions** queue (to dispense / dispensed / all) where medications are handed over and come out of stock, a **stock** list (deliveries, reorder levels, stock counts, movement history), and read-only patient records
- All three — chat, notifications and settings

Receptionists do everything an admin does at the front desk except delete patients and void invoices, which stay with admins.

### Pharmacy stock

Dispensing and the shelf are kept in step. When a pharmacist hands a prescription over they pick
which stock item it came from — the catalogue entry matching what the doctor wrote is pre-selected —
and say how many units. That quantity leaves stock in the same transaction that marks the
prescription dispensed, so the queue and the shelf can never disagree. Medications the pharmacy
doesn't stock can still be recorded as handed over; the stock field is simply left blank.

- **Nothing changes stock silently.** Deliveries, dispensing and stock counts each write a row to an
  append-only ledger with the balance after the change, so any quantity on hand can be explained.
  Undoing a dispense puts the units back as its own entry rather than erasing the original.
- **Stock can't go negative**, and a correction based on a count someone else has since changed is
  refused rather than overwriting it.
- **Reorder levels** are per medication. Falling to or below one alerts every pharmacist and admin,
  at most once a day for each level, with "out of stock" treated as its own, more urgent alert.
- **Stock value** (quantity × unit price) and units dispensed in the last 30 days sit at the top of
  the page, next to the count of what needs reordering.

Deleting a medication is admin-only and refused once anything has been dispensed from it, so the
history stays intact — deactivate it instead and it drops out of the dispensing list.

### Chat and SMS

One chat box for everyone:

- **Everyone with a portal** (admins, doctors, nurses, pharmacists and receptionists) reads and replies in the app. Tick **Also send by SMS** to text them as well.
- **Patients** (who can't sign in) always receive chat messages by SMS, e.g. `Mi Dokta - RY Admin 99: Your results are ready.`
- **Replies by text** are posted back into that person's most recent conversation (or a new chat with the main admin), marked "via SMS".
- Each sent message shows its SMS status (sending, sent, failed, or not sent because of no phone number / opt-out).
- Direct messages and named groups (groups can mix app users and SMS-only members); doctors can message staff and their own patients, admins and staff can message everyone.
- Messages that go out by SMS are limited to 450 characters (about three SMS).

To receive replies, set your provider's incoming-message webhook to
`https://<your-domain>/api/sms/inbound?token=<SMS_WEBHOOK_SECRET>` (Twilio: phone number → Messaging → "A message comes in", method POST; Africa's Talking: SMS → Callback URLs → Incoming messages). The app must be reachable from the internet for this.

> **Replies need a provider that can receive.** A Twilio alphanumeric sender ID such as `MiDokta` is
> send-only — there is no number for a patient to text back. `smsgate` (below) receives replies
> because the messages come from a real SIM. Admin → SMS states which applies to your setup.

### SMS notifications

Patients and medical staff receive texts on the phone number in their profile (each person can opt out):

| Who      | When                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Patients | appointment requested, confirmed, rejected or cancelled; reminder within 24h of an appointment; follow-up due tomorrow; invoice issued; payment received |
| Doctors  | appointment assigned or cancelled by the front desk; daily schedule each morning                                                     |
| Anyone   | chat messages (see **Chat and SMS** above)                                                                                            |

Low stock alerts go to the notification bell only, not by SMS.

Setup (`.env`):

1. `SMS_PROVIDER` — `console` (messages are only logged, nothing is sent), `smsgate`, `twilio`, or
   `africastalking`. A **Twilio trial** is fine for development against verified numbers; for
   production in Sierra Leone use `smsgate` or a paid Twilio account. Africa's Talking doesn't cover
   Sierra Leone at all.
2. Provider credentials (and `SMS_WEBHOOK_SECRET` for replies) — SMS Gateway: `SMSGATE_USERNAME`, `SMSGATE_PASSWORD`, optional `SMSGATE_BASE_URL`; Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`; Africa's Talking: `AT_USERNAME`, `AT_API_KEY`, optional `AT_SENDER_ID`
3. `SMS_DEFAULT_COUNTRY_CODE` (default `232`) so local numbers like `076 123456` work, and `APP_TIME_ZONE` (default `Africa/Freetown`)
4. `SMS_ALLOWED_NUMBERS` (optional) — while set, only these numbers are texted and everyone else is
   logged as skipped. Useful with a Twilio trial, which can only reach verified numbers.
5. Reminders and daily schedules are sent by a scheduled job. Call it every 15 minutes:
   - `npm run sms:cron` (e.g. from Windows Task Scheduler or cron), or
   - `POST /api/cron/sms` with header `Authorization: Bearer <CRON_SECRET>` from any scheduler (e.g. Vercel Cron, cron-job.org).
   It never texts anyone twice for the same reminder. Admins can also press **Run scheduled reminders now** on the SMS page.

Every message (sent, failed or skipped, with the reason) is recorded in **Admin → SMS**. Messages are kept to plain GSM characters so they aren't billed at the more expensive Unicode rate.

#### Local development, with no provider at all

`SMS_PROVIDER="console"` (the default) is a complete SMS tool on its own, with nothing to sign up
for. Messages aren't sent to phones; everything else behaves exactly as it would in production:

- Each message is printed to the terminal running `npm run dev`:
  `[sms:console] to +23278222333: Mi Dokta: Reminder, Bilal: ...`
- Every message is recorded in **Admin → SMS** with its full text, recipient, category and status —
  so that page doubles as a local outbox. Opt-outs, missing numbers and the test allowlist are all
  applied as usual.
- `npm run sms:cron` triggers the scheduled reminders on demand, rather than waiting for the clock.
- **Replies** can be simulated, so the text-back-into-chat flow is testable with no provider:

  ```bash
  npm run sms:reply -- "+23276777888" "Yes doctor, I will come tomorrow."
  ```

  That posts the same payload a real gateway would to `/api/sms/inbound`, so the message appears in
  that person's conversation marked "via SMS". A number nobody owns is logged as skipped, exactly as
  it would be in production. The dev server has to be running.

When you want texts to actually arrive on a handset, pick one of the providers below.

#### SMS Gateway for Android (recommended in Sierra Leone)

[SMS Gateway for Android](https://sms-gate.app) turns an Android phone into the SMS sender. Texts
leave from a local SIM as ordinary person-to-person messages, so there is no card, no provider
account, no per-message international rate — and **patients can text back**, which an alphanumeric
sender ID can't do.

What it costs is a spare Android phone (5.0 or newer), a SIM with an SMS bundle, power and internet.

1. Install the app from [sms-gate.app](https://sms-gate.app) on the phone that holds the SIM.
2. Open it, turn on **Cloud Server**, and copy the username and password it shows into
   `SMSGATE_USERNAME` and `SMSGATE_PASSWORD` in `.env`. Set `SMS_PROVIDER="smsgate"`.
3. Leave `SMSGATE_BASE_URL` blank to use the project's public relay. To keep traffic off it, run
   their private server and point this at it, or — if the app and this server share a network —
   set it to the phone directly, e.g. `http://192.168.1.50:8080`.
4. For replies, add a webhook in the app for the `sms:received` event pointing at
   `https://<your-domain>/api/sms/inbound?token=<SMS_WEBHOOK_SECRET>`.
5. Test: open **Chat**, message a patient who has a phone number, then check **Admin → SMS**.

Trade-offs worth knowing: the sender shows as the SIM's phone number, not "Mi Dokta" (the message
body still opens with the brand name). The phone has to stay on, charged and online — treat it as
part of the server. Throughput is that of one handset, which is ample for appointment traffic but
not for mass marketing, and carriers may throttle very high volumes from one SIM.

#### Twilio on a trial account (development)

A trial is enough to develop against: it sends real SMS, but only to numbers you have verified.

1. **`TWILIO_AUTH_TOKEN`** — from the Twilio Console. `TWILIO_ACCOUNT_SID` is already set.
2. **`TWILIO_FROM` must be your Twilio phone number** (the free one the trial gives you, `+1…`).
   An alphanumeric sender ID like `MiDokta` is rejected on trials with **error 21267** — those need
   a paid account.
3. **Verify the phones you will test with** under Console → Phone Numbers → **Verified Caller IDs**.
   Texting anything else fails with **error 21608**.
4. **Enable Sierra Leone** under Console → Messaging → Settings → **Geo Permissions** if you are
   testing +232 numbers. Most countries are off by default.
5. **Set `SMS_ALLOWED_NUMBERS`** to the numbers you verified, comma-separated. While it is set, the
   app only texts those and logs everyone else as *Skipped* with the reason — so the seeded patients'
   numbers don't fail against your trial credit. **Admin → SMS** shows a banner while it is on.
   Clear it to text everyone.
6. **Check it works:** open **Chat**, message a patient whose number you verified, then open
   **Admin → SMS**. A green *Sent* row means Twilio accepted it; a *Failed* row shows Twilio's own
   error text.

Trial messages arrive prefixed with "Sent from your Twilio trial account". Replies don't come back:
a trial has no inbound webhook you can point at `localhost` anyway, and Admin → SMS will report the
provider as send-only.

#### Twilio in production

Going live needs a paid account (minimum top-up around $20). Then `TWILIO_FROM` can be an
alphanumeric sender ID — Sierra Leone allows these without pre-registration, so texts show "MiDokta"
as the sender instead of a foreign number. Keep it under 11 characters with no spaces, and avoid
generic words, which Africell filters. Clear `SMS_ALLOWED_NUMBERS` so real patients are texted.

Billing currency is set in `src/lib/money.ts` (default `SLE`).

## Setup

1. Create a PostgreSQL database and fill in `.env` (see `.env.example`):
   - `DATABASE_URL` — connection string
   - `SESSION_SECRET` — long random string used to sign login sessions
2. Install and prepare the database:

   ```bash
   npm install
   npm run db:push    # create/update tables from prisma/schema.prisma
   npm run db:seed    # sample data (resets all data!)
   npm run dev
   ```

3. Open <http://localhost:3000> and sign in.

Stop `npm run dev` before running `db:push` on Windows — the running server locks Prisma's engine file.

### Seeded accounts (development only)

All use the password `Password123!`.

| Role         | Email                          |
| ------------ | ------------------------------ |
| Admin        | `admin@test.com`               |
| Doctor       | `sarah.kamara@midokta.test`    |
| Doctor       | `billoh.gassama@midokta.test`  |
| Receptionist | `mohamed.jalloh@midokta.test`  |
| Nurse        | `aminata.turay@midokta.test`   |
| Pharmacist   | `mary.sesay@midokta.test`      |

## Structure

- `prisma/schema.prisma` — `Hospital`, `User` (roles, profile, doctor and patient fields), `Appointment`, `MedicalRecord`, `Prescription` (including who dispensed it, when, and what it took from stock), `Medication`, `StockMovement`, `Invoice`, `InvoiceItem`, `Payment`, `Notification`, `Conversation`, `ConversationParticipant`, `Message`, `SmsMessage`
- `src/lib/auth.ts` — session cookie (signed JWT), `requireUser` for pages, `authorize` for actions/API routes
- `src/lib/roles.ts` — who can do what: which roles have a portal, which run the front desk, and each role's portal root
- `src/lib/form.ts` — form parsing/validation helpers for server actions
- `src/lib/notifications.ts` — sending notifications and generating reminders
- `src/lib/chat.ts` — conversation queries and unread counts
- `src/lib/stock.ts` — applying stock changes with their ledger entry, low-stock alerts, matching a written prescription to the catalogue
- `src/lib/sms/` — phone normalisation, providers (console, Twilio, Africa's Talking), queue/delivery, message templates, scheduled reminders
- `src/app/login` — sign-in page
- `src/app/admin/*`, `src/app/doctor/*`, `src/app/staff/*` — portal pages. Pages shared between portals (appointments, patients, billing) live in `src/components/` and take a `basePath`, so each portal is a thin wrapper around one implementation.
- `src/app/actions/*` — server actions, each checking the user's role
- `src/app/api/appointments`, `src/app/api/notifications`, `src/app/api/chat/*`, `src/app/api/sms/inbound`, `src/app/api/cron/sms` — calendar feed, notification bell, chat data, incoming SMS webhook, scheduled SMS
- `src/components/` — UI by feature (`appointments`, `billing`, `chat`, `doctors`, `hospitals`, `inventory`, `notifications`, `patients`, `prescriptions`, `records`, `staff`, `settings`, `ui`)
