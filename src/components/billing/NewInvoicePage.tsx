import Link from "next/link";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import InvoiceForm, { type BillableAppointment } from "./InvoiceForm";
import { formatDate } from "@/components/appointments/shared";

type Props = {
  basePath: string;
  searchParams: Promise<{ patient?: string; appointment?: string }>;
};

/** The new-invoice form, shared by the admin and receptionist portals. */
export default async function NewInvoicePage({ basePath, searchParams }: Props) {
  const { patient: patientParam, appointment: appointmentParam } = await searchParams;

  const [patients, appointments] = await Promise.all([
    prisma.user.findMany({
      where: { role: Role.PATIENT, isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    }),
    prisma.appointment.findMany({
      where: { status: { in: ["CONFIRMED", "COMPLETED"] } },
      orderBy: { startsAt: "desc" },
      take: 500,
      include: { doctor: { select: { firstName: true, lastName: true } }, _count: { select: { invoices: true } } },
    }),
  ]);

  const billable: BillableAppointment[] = appointments.map((a) => ({
    id: a.id,
    patientId: a.patientId,
    label: `${formatDate(a.startsAt.toISOString())} · ${a.title}${a.doctor ? ` · Dr. ${a.doctor.lastName}` : ""}`,
    title: a.title,
    alreadyInvoiced: a._count.invoices > 0,
  }));

  const preselected = billable.find((a) => a.id === appointmentParam);

  return (
    <div className="settings">
      <Link href={`${basePath}/billing`} className="back-link">
        <i className="fa-solid fa-arrow-left" /> Billing
      </Link>
      <h2 className="section-heading detail-section-heading">New Invoice</h2>
      <InvoiceForm
        patients={patients.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` }))}
        appointments={billable}
        initialPatientId={preselected?.patientId ?? patientParam ?? ""}
        initialAppointmentId={preselected?.id ?? ""}
        basePath={basePath}
      />
    </div>
  );
}
