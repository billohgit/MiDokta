import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { personSelect } from "@/lib/people";
import Avatar from "@/components/appointments/Avatar";
import StatCard from "@/components/StatCard";
import { STATUS_LABEL, VISIT_LABEL, formatDate, formatTime, fullName } from "@/components/appointments/shared";
import DoctorDetailActions from "@/components/doctors/DoctorDetailActions";
import type { DoctorRow } from "@/components/doctors/types";

export const dynamic = "force-dynamic";

const GENDER_LABEL = { MALE: "Male", FEMALE: "Female", OTHER: "Other" } as const;

export default async function AdminDoctorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const now = new Date();

  const [doctor, hospitals] = await Promise.all([
    prisma.user.findFirst({
      where: { id, role: Role.DOCTOR },
      include: {
        hospital: { select: { id: true, name: true } },
        doctorAppointments: {
          orderBy: { startsAt: "desc" },
          include: { patient: { select: personSelect } },
        },
      },
    }),
    prisma.hospital.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!doctor) notFound();

  const appts = doctor.doctorAppointments;
  const upcoming = appts.filter((a) => a.status === "CONFIRMED" && a.startsAt >= now).length;
  const completed = appts.filter((a) => a.status === "COMPLETED").length;
  const patients = new Set(appts.filter((a) => a.status !== "REJECTED").map((a) => a.patientId)).size;

  const row: DoctorRow = {
    id: doctor.id,
    firstName: doctor.firstName,
    lastName: doctor.lastName,
    email: doctor.email,
    phone: doctor.phone,
    smsOptIn: doctor.smsOptIn,
    avatarUrl: doctor.avatarUrl,
    gender: doctor.gender,
    specialty: doctor.specialty,
    licenseNumber: doctor.licenseNumber,
    experienceYears: doctor.experienceYears,
    bio: doctor.bio,
    isActive: doctor.isActive,
    hospital: doctor.hospital,
    totalAppointments: appts.length,
    upcomingAppointments: upcoming,
  };

  const details: [string, string | null][] = [
    ["Email", doctor.email],
    ["Phone Number", doctor.phone],
    ["Hospital", doctor.hospital?.name ?? null],
    ["Specialty", doctor.specialty],
    ["License Number", doctor.licenseNumber],
    ["Experience", doctor.experienceYears !== null ? `${doctor.experienceYears} years` : null],
    ["Gender", doctor.gender ? GENDER_LABEL[doctor.gender] : null],
    ["Joined", formatDate(doctor.createdAt.toISOString())],
  ];

  return (
    <div className="settings">
      <Link href="/admin/doctors" className="back-link">
        <i className="fa-solid fa-arrow-left" /> All doctors
      </Link>

      <section className="card profile-card doctor-profile">
        <Avatar person={doctor} size={120} online={doctor.isActive} />
        <div className="doctor-profile-main">
          <h2 className="profile-name">
            Dr. {doctor.firstName} {doctor.lastName}
          </h2>
          <p className="profile-role">{doctor.specialty ?? "General Practice"}</p>
          <span className={`status-pill ${doctor.isActive ? "status-confirmed" : "status-cancelled"}`}>
            {doctor.isActive ? "Active" : "Inactive"}
          </span>
        </div>
        <DoctorDetailActions doctor={row} hospitals={hospitals} />
      </section>

      <section className="stats">
        <StatCard label="Appointments" value={appts.length} icon="fa-calendar" />
        <StatCard label="Upcoming" value={upcoming} icon="fa-calendar-check" />
        <StatCard label="Completed" value={completed} icon="fa-circle-check" />
        <StatCard label="Patients" value={patients} icon="fa-bed-pulse" />
      </section>

      <section className="card details-card">
        <div className="details-head">
          <h3>Basic Detail</h3>
        </div>
        <div className="details-grid">
          {details.map(([label, value]) => (
            <div key={label} className="detail-row">
              <span className="detail-label">{label}:</span>
              <span className="detail-value">{value || "—"}</span>
            </div>
          ))}
        </div>
        {doctor.bio && (
          <>
            <h3 className="details-subhead">Bio</h3>
            <p className="detail-value doctor-bio">{doctor.bio}</p>
          </>
        )}
      </section>

      <h2 className="section-heading detail-section-heading">Appointments</h2>
      {appts.length === 0 ? (
        <div className="empty-banner">No appointments found.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Reason</th>
                <th>Date</th>
                <th>Time</th>
                <th>Visit Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {appts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="person-cell">
                      <Avatar person={a.patient} size={36} />
                      <span>{fullName(a.patient)}</span>
                    </div>
                  </td>
                  <td>{a.title}</td>
                  <td>{formatDate(a.startsAt.toISOString())}</td>
                  <td>{formatTime(a.startsAt.toISOString())}</td>
                  <td>{VISIT_LABEL[a.visitType]}</td>
                  <td>
                    <span className={`status-pill status-${a.status.toLowerCase()}`}>{STATUS_LABEL[a.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
