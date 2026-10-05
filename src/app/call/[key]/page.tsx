import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { joinUrl, patientStartWindow, videoConfigured } from "@/lib/video";
import { smsDate, smsTime } from "@/lib/sms/templates";
import PatientStartCallButton from "@/components/video/PatientStartCallButton";
import Logo from "@/components/Logo";

export const dynamic = "force-dynamic";

// The key in this URL is the patient's only credential: keep it out of search engines and referrers.
export const metadata: Metadata = {
  title: "Video visit | Mi Dokta",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Notice({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <main className="login-page">
      <div className="card login-card call-notice">
        <div className="login-brand">
          <Logo stacked tagline />
        </div>
        <h1>{title}</h1>
        <p className="login-sub">{text}</p>
        {children}
      </div>
    </main>
  );
}

/** Where a patient joins their video visit from the texted link. No sign-in: the key is the pass. */
export default async function PatientCallPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const appt = await prisma.appointment.findUnique({
    where: { videoPatientKey: key },
    include: { patient: { select: { firstName: true } }, doctor: { select: { lastName: true } } },
  });

  if (!appt || appt.visitType !== "VIDEO_CALL") {
    return <Notice title="Link not valid" text="This video call link isn't valid. Check the text message, or contact the clinic." />;
  }
  if (appt.status !== "CONFIRMED") {
    return <Notice title="This call has ended" text="This video visit is no longer active. Contact the clinic if you need another appointment." />;
  }

  if (!videoConfigured()) {
    return <Notice title="Video calls are unavailable" text="Video calls aren't available right now. Please contact the clinic." />;
  }

  const url = await joinUrl(appt, { name: appt.patient.firstName, isOwner: false });
  if (!url) {
    const doctor = appt.doctor ? `Dr. ${appt.doctor.lastName}` : "your doctor";
    const when = `${smsDate(appt.startsAt)} at ${smsTime(appt.startsAt)}`;
    const timing = appt.doctorId ? patientStartWindow(appt.startsAt) : "early";
    if (timing === "open") {
      return (
        <Notice title="Your video visit" text={`Your visit with ${doctor} is at ${when}. Tap below to start the call; ${doctor} will be told you're waiting.`}>
          <PatientStartCallButton callKey={key} />
        </Notice>
      );
    }
    if (timing === "late") {
      return <Notice title="This call has ended" text="This appointment time has passed. Please contact the clinic if you need another appointment." />;
    }
    return (
      <Notice
        title="It's not time yet"
        text={`Your video visit with ${doctor} is on ${when}. Open this link again from 15 minutes before then to start the call.`}
      />
    );
  }

  return (
    <main className="patient-call">
      <header className="patient-call-head">
        <Logo />
        <span>
          Video visit{appt.doctor ? ` with Dr. ${appt.doctor.lastName}` : ""}
        </span>
      </header>
      <iframe
        src={url}
        title="Video visit"
        allow="camera; microphone; fullscreen; speaker; display-capture; autoplay; compute-pressure"
        referrerPolicy="no-referrer"
      />
    </main>
  );
}
