import bcrypt from "bcryptjs";
import { AppointmentStatus, Prisma, PrismaClient, Role, VisitType } from "@prisma/client";

const prisma = new PrismaClient();

// Development-only password shared by every seeded account.
const DEV_PASSWORD = "Password123!";

// A date `days` from today at the given local time.
function daysFromNow(days: number, hours: number, minutes = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function hoursFromNow(hours: number) {
  const d = new Date(Date.now() + hours * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d;
}

async function main() {
  const PASSWORD = await bcrypt.hash(DEV_PASSWORD, 12);

  // Children before parents.
  await prisma.smsMessage.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.medicalRecord.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.deleteMany();

  const [central, community] = await Promise.all([
    prisma.hospital.create({
      data: {
        name: "Central Hospital",
        address: "1 Main Street",
        city: "Freetown",
        phone: "+232 76 000 001",
        email: "info@central.midokta.test",
      },
    }),
    prisma.hospital.create({
      data: {
        name: "Community Clinic",
        address: "22 Park Road",
        city: "Bo",
        phone: "+232 76 000 002",
        email: "hello@community.midokta.test",
      },
    }),
  ]);

  // Main admin account
  const admin = await prisma.user.create({
    data: {
      firstName: "RY",
      lastName: "Admin 99",
      email: "admin@test.com",
      phone: "987654323456",
      gender: "FEMALE",
      dateOfBirth: new Date("1990-02-02"),
      password: PASSWORD,
      role: Role.ADMIN,
    },
  });

  const people: Omit<Prisma.UserCreateManyInput, "email" | "password">[] = [
    { firstName: "Admin", lastName: "Two", role: Role.ADMIN },
    {
      firstName: "Sarah",
      lastName: "Kamara",
      role: Role.DOCTOR,
      hospitalId: central.id,
      specialty: "Cardiology",
      phone: "+232 76 100 200",
      licenseNumber: "MDC-10234",
      experienceYears: 12,
      bio: "Consultant cardiologist focused on preventive heart care.",
    },
    {
      firstName: "Billoh",
      lastName: "Gassama",
      role: Role.DOCTOR,
      hospitalId: community.id,
      specialty: "Obstetrics & Gynaecology",
      phone: "078 300 400",
      licenseNumber: "MDC-20871",
      experienceYears: 8,
    },
    { firstName: "Mary", lastName: "Sesay", role: Role.PHARMACIST, hospitalId: central.id, phone: "+232 77 500 600" },
    { firstName: "Aminata", lastName: "Turay", role: Role.NURSE, hospitalId: central.id, gender: "FEMALE", phone: "+232 79 700 800" },
    { firstName: "Mohamed", lastName: "Jalloh", role: Role.RECEPTIONIST, hospitalId: community.id, gender: "MALE" },
    {
      firstName: "Rutaba",
      lastName: "Khan",
      role: Role.PATIENT,
      gender: "FEMALE",
      dateOfBirth: new Date("1994-06-12"),
      phone: "+232 77 123 456",
      bloodGroup: "O+",
      smsOptIn: false, // shows up as "Opted out" in the SMS log
      city: "Freetown",
      emergencyContactName: "Ali Khan",
      emergencyContactPhone: "+232 77 654 321",
    },
    {
      firstName: "Bilal",
      lastName: "Niazi",
      role: Role.PATIENT,
      gender: "MALE",
      dateOfBirth: new Date("1981-01-30"),
      phone: "+232 78 222 333",
      bloodGroup: "A+",
      allergies: "Penicillin",
      chronicConditions: "Hypertension",
    },
    {
      firstName: "Fatmata",
      lastName: "Bangura",
      role: Role.PATIENT,
      gender: "FEMALE",
      dateOfBirth: new Date("1998-09-03"),
      phone: "+232 79 444 555",
      bloodGroup: "B+",
      city: "Bo",
    },
    {
      firstName: "Ibrahim",
      lastName: "Koroma",
      role: Role.PATIENT,
      gender: "MALE",
      dateOfBirth: new Date("1967-03-21"),
      phone: "+232 76 777 888",
      bloodGroup: "AB-",
      chronicConditions: "Type 2 diabetes",
    },
  ];

  await prisma.user.createMany({
    data: people.map((p) => ({
      ...p,
      email: `${p.firstName}.${p.lastName}@midokta.test`.toLowerCase(),
      password: PASSWORD,
    })),
  });

  const byEmail = async (first: string, last: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { email: `${first}.${last}@midokta.test`.toLowerCase() } })).id;

  const sarah = await byEmail("Sarah", "Kamara");
  const billoh = await byEmail("Billoh", "Gassama");
  const rutaba = await byEmail("Rutaba", "Khan");
  const bilal = await byEmail("Bilal", "Niazi");
  const fatmata = await byEmail("Fatmata", "Bangura");
  const ibrahim = await byEmail("Ibrahim", "Koroma");
  const mary = await byEmail("Mary", "Sesay");

  await prisma.appointment.createMany({
    data: [
      // Pending requests (no doctor assigned yet)
      { title: "General check-up", patientId: rutaba, startsAt: daysFromNow(3, 10), visitType: VisitType.IN_PERSON },
      { title: "Follow-up", patientId: rutaba, startsAt: daysFromNow(3, 12, 30), visitType: VisitType.VIDEO_CALL },
      { title: "Consultation", patientId: bilal, startsAt: daysFromNow(5, 12, 30), visitType: VisitType.IN_PERSON },
      { title: "Headache", patientId: fatmata, startsAt: daysFromNow(6, 9), visitType: VisitType.VIDEO_CALL },
      // Pending request sent to a specific doctor
      {
        title: "Chest pain review",
        patientId: bilal,
        doctorId: sarah,
        hospitalId: central.id,
        startsAt: daysFromNow(2, 15),
        visitType: VisitType.IN_PERSON,
      },
      // Confirmed and within 24 hours, so Dr. Kamara gets a reminder
      {
        title: "Blood test review",
        patientId: ibrahim,
        doctorId: sarah,
        hospitalId: central.id,
        startsAt: hoursFromNow(3),
        status: AppointmentStatus.CONFIRMED,
      },
    ],
  });

  // A completed visit with a consultation record, prescriptions and a part-paid invoice.
  const prenatal = await prisma.appointment.create({
    data: {
      title: "Prenatal visit",
      patientId: fatmata,
      doctorId: billoh,
      hospitalId: community.id,
      startsAt: daysFromNow(-4, 14),
      status: AppointmentStatus.COMPLETED,
      record: {
        create: {
          patientId: fatmata,
          doctorId: billoh,
          chiefComplaint: "Routine prenatal check, mild nausea",
          diagnosis: "Normal pregnancy, 20 weeks",
          notes: "Fetal heart rate normal. Advised hydration and small frequent meals.",
          temperature: "36.7",
          bloodPressure: "112/74",
          heartRate: 82,
          oxygenSaturation: 99,
          weight: "64.5",
          followUpDate: daysFromNow(24, 0),
          prescriptions: {
            create: [
              { medication: "Folic acid", dosage: "5mg", frequency: "Once daily", duration: "12 weeks" },
              {
                medication: "Ferrous sulfate",
                dosage: "200mg",
                frequency: "Once daily",
                duration: "8 weeks",
                instructions: "Take after food",
              },
            ],
          },
        },
      },
    },
  });

  // An earlier completed visit for Ibrahim with Dr. Kamara.
  await prisma.appointment.create({
    data: {
      title: "Diabetes review",
      patientId: ibrahim,
      doctorId: sarah,
      hospitalId: central.id,
      startsAt: daysFromNow(-30, 9),
      status: AppointmentStatus.COMPLETED,
      record: {
        create: {
          patientId: ibrahim,
          doctorId: sarah,
          chiefComplaint: "Fatigue and frequent urination",
          diagnosis: "Type 2 diabetes — suboptimal control",
          temperature: "36.9",
          bloodPressure: "138/88",
          heartRate: 76,
          weight: "91.0",
          prescriptions: {
            create: [{ medication: "Metformin", dosage: "500mg", frequency: "Twice daily", duration: "3 months" }],
          },
        },
      },
    },
  });

  await prisma.invoice.create({
    data: {
      patientId: fatmata,
      appointmentId: prenatal.id,
      hospitalId: community.id,
      total: "450.00",
      amountPaid: "200.00",
      status: "PARTIAL",
      dueDate: daysFromNow(10, 0),
      items: {
        create: [
          { description: "Consultation fee", quantity: 1, unitPrice: "250.00" },
          { description: "Ultrasound scan", quantity: 1, unitPrice: "200.00" },
        ],
      },
      payments: { create: [{ amount: "200.00", method: "MOBILE_MONEY", reference: "OM-883201", receivedById: admin.id }] },
    },
  });

  await prisma.invoice.create({
    data: {
      patientId: ibrahim,
      hospitalId: central.id,
      total: "150.00",
      status: "UNPAID",
      dueDate: daysFromNow(-2, 0),
      items: { create: [{ description: "Blood test", quantity: 1, unitPrice: "150.00" }] },
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: admin.id,
        type: "APPOINTMENT_COMPLETED",
        title: "Consultation completed",
        body: "Dr. Billoh Gassama completed Fatmata Bangura's visit. Ready for billing.",
        link: `/admin/billing/new?appointment=${prenatal.id}`,
      },
      {
        userId: sarah,
        type: "APPOINTMENT_REQUEST",
        title: "New appointment request",
        body: "Bilal Niazi · Chest pain review",
        link: "/doctor/appointments",
      },
    ],
  });

  // Chat: a direct conversation and a group.
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);
  await prisma.conversation.create({
    data: {
      directKey: [admin.id, sarah].sort().join(":"),
      createdById: admin.id,
      lastMessageAt: minutesAgo(5),
      participants: {
        create: [
          { userId: admin.id, lastReadAt: minutesAgo(30) },
          { userId: sarah, lastReadAt: minutesAgo(5) },
        ],
      },
      messages: {
        create: [
          { senderId: admin.id, body: "Good morning Dr. Kamara, Mr. Koroma's blood results are in.", createdAt: minutesAgo(45) },
          { senderId: sarah, body: "Thanks! I'll review them before his appointment today.", createdAt: minutesAgo(20) },
          { senderId: sarah, body: "Could you also make sure his invoice from last month is followed up?", createdAt: minutesAgo(5) },
        ],
      },
    },
  });
  await prisma.conversation.create({
    data: {
      title: "Clinical team",
      isGroup: true,
      createdById: admin.id,
      lastMessageAt: minutesAgo(120),
      participants: {
        create: [{ userId: admin.id }, { userId: sarah }, { userId: billoh }, { userId: await byEmail("Aminata", "Turay") }],
      },
      messages: {
        create: [
          { senderId: admin.id, body: "Welcome to the clinical team chat 👋", createdAt: minutesAgo(180) },
          { senderId: billoh, body: "Reminder: staff meeting on Friday at 9am.", createdAt: minutesAgo(120) },
        ],
      },
    },
  });

  // A chat with a patient: the admin's message went out by SMS and the patient replied by text.
  const patientChat = await prisma.conversation.create({
    data: {
      directKey: [admin.id, ibrahim].sort().join(":"),
      createdById: admin.id,
      lastMessageAt: minutesAgo(10),
      participants: { create: [{ userId: admin.id, lastReadAt: minutesAgo(60) }, { userId: ibrahim }] },
    },
  });
  const outgoing = await prisma.message.create({
    data: {
      conversationId: patientChat.id,
      senderId: admin.id,
      body: "Hello Mr. Koroma, please remember to fast from midnight before your blood test today.",
      createdAt: minutesAgo(90),
    },
  });
  await prisma.smsMessage.create({
    data: {
      userId: ibrahim,
      to: "+23276777888",
      body: `Mi Dokta - RY Admin 99: ${outgoing.body}`,
      category: "CHAT",
      status: "SENT",
      provider: "console",
      sentById: admin.id,
      messageId: outgoing.id,
      createdAt: minutesAgo(90),
      sentAt: minutesAgo(90),
    },
  });
  const reply = await prisma.message.create({
    data: {
      conversationId: patientChat.id,
      senderId: ibrahim,
      body: "Thank you, I will. Should I still take my metformin in the morning?",
      source: "SMS",
      createdAt: minutesAgo(10),
    },
  });
  await prisma.smsMessage.create({
    data: {
      direction: "INBOUND",
      userId: ibrahim,
      to: "+23276777888",
      body: reply.body,
      category: "CHAT_REPLY",
      status: "SENT",
      messageId: reply.id,
      createdAt: minutesAgo(10),
      sentAt: minutesAgo(10),
    },
  });

  // A pharmacy stock list covering what the doctors above prescribed, with one item
  // already low and one out, so the reordering alerts have something to show.
  const CATALOGUE = [
    { name: "Metformin", strength: "500mg", form: "Tablet", unit: "tablet", opening: 240, reorderLevel: 60, unitPrice: "1.50" },
    { name: "Folic acid", strength: "5mg", form: "Tablet", unit: "tablet", opening: 180, reorderLevel: 50, unitPrice: "0.80" },
    { name: "Ferrous sulfate", strength: "200mg", form: "Tablet", unit: "tablet", opening: 40, reorderLevel: 50, unitPrice: "1.20" },
    { name: "Amoxicillin", strength: "500mg", form: "Capsule", unit: "capsule", opening: 120, reorderLevel: 40, unitPrice: "2.75" },
    { name: "Paracetamol", strength: "500mg", form: "Tablet", unit: "tablet", opening: 500, reorderLevel: 100, unitPrice: "0.40" },
    { name: "Artemether/Lumefantrine", strength: "20/120mg", form: "Tablet", unit: "tablet", opening: 0, reorderLevel: 60, unitPrice: "3.20" },
    { name: "Oral rehydration salts", strength: null, form: "Sachet", unit: "sachet", opening: 150, reorderLevel: 40, unitPrice: "1.00" },
  ];

  const stock: Record<string, string> = {};
  for (const [i, item] of CATALOGUE.entries()) {
    const medication = await prisma.medication.create({
      data: {
        name: item.name,
        strength: item.strength,
        form: item.form,
        unit: item.unit,
        quantity: item.opening,
        reorderLevel: item.reorderLevel,
        unitPrice: item.unitPrice,
      },
    });
    stock[item.name] = medication.id;

    if (item.opening > 0) {
      await prisma.stockMovement.create({
        data: {
          medicationId: medication.id,
          type: "RECEIVED",
          change: item.opening,
          balance: item.opening,
          note: "Opening stock",
          recordedById: mary,
          createdAt: daysFromNow(-45, 9, i),
        },
      });
    }
  }

  // One prescription already handed over, so the pharmacist's queue shows both states
  // and the stock ledger has a dispense in it.
  const metformin = await prisma.prescription.findFirst({ where: { medication: "Metformin" } });
  if (metformin) {
    const dispensedQuantity = 60;
    const medicationId = stock["Metformin"];
    const balance = CATALOGUE[0].opening - dispensedQuantity;

    await prisma.prescription.update({
      where: { id: metformin.id },
      data: { dispensedAt: daysFromNow(-30, 10), dispensedById: mary, medicationId, dispensedQuantity },
    });
    await prisma.medication.update({ where: { id: medicationId }, data: { quantity: balance } });
    await prisma.stockMovement.create({
      data: {
        medicationId,
        type: "DISPENSED",
        change: -dispensedQuantity,
        balance,
        note: "Dispensed to patient · Metformin",
        prescriptionId: metformin.id,
        recordedById: mary,
        createdAt: daysFromNow(-30, 10),
      },
    });
  }

  console.log(`Seed complete. All accounts use the password: ${DEV_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
