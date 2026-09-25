import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { joinUrl, patientLink, videoConfigured } from "@/lib/video";
import StartCallButton from "@/components/video/StartCallButton";
import PatientLinkBar from "@/components/video/PatientLinkBar";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ untexted?: string }> };

export default async function DoctorCallPage({ params, searchParams }: Props) {
  const doctor = await requireUser(Role.DOCTOR);
  const { id } = await params;
  const { untexted } = await searchParams;

  const appt = await prisma.appointment.findFirst({ where: { id, doctorId: doctor.id }, include: { patient: true } });
  if (!appt || appt.visitType !== "VIDEO_CALL") notFound();

  const open = appt.status === "CONFIRMED";
  const url = open && videoConfigured() ? await joinUrl(appt, { name: `Dr. ${doctor.lastName}`, isOwner: true }) : null;
  const patientName = `${appt.patient.firstName} ${appt.patient.lastName}`;

  return (
    <div className="call-page">
      <div className="call-head">
        <Link href={`/doctor/appointments/${appt.id}`} className="back-link">
          <i className="fa-solid fa-arrow-left" /> Back to consultation
        </Link>
        <h2 className="section-heading">Video call with {patientName}</h2>
      </div>

      {url && appt.videoPatientKey ? (
        <>
          <PatientLinkBar id={appt.id} link={await patientLink(appt.videoPatientKey)} untexted={untexted === "1"} />
          <iframe
            className="call-frame card"
            src={url}
            title={`Video call with ${patientName}`}
            allow="camera; microphone; fullscreen; speaker; display-capture; autoplay; compute-pressure"
            referrerPolicy="no-referrer"
          />
        </>
      ) : (
        <div className="empty-banner call-empty">
          {!open ? (
            "Video calls are only available while the appointment is confirmed."
          ) : !videoConfigured() ? (
            "Video calls aren't set up yet. Add DAILY_API_KEY to the server settings."
          ) : (
            <>
              <p>The call room isn&apos;t open{appt.videoRoomName ? " any more" : " yet"}.</p>
              <StartCallButton id={appt.id} label={appt.videoRoomName ? "Reopen the call" : "Start video call"} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
