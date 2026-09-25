import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { joinUrl, videoConfigured } from "@/lib/video";
import Logo from "@/components/Logo";

export const dynamic = "force-dynamic";

// The key in this URL is the patient's only credential: keep it out of search engines and referrers.
export const metadata: Metadata = {
  title: "Video visit | Mi Dokta",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <main className="login-page">
      <div className="card login-card call-notice">
        <div className="login-brand">
          <Logo stacked tagline />
        </div>
        <h1>{title}</h1>
        <p className="login-sub">{text}</p>
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

  const url = videoConfigured() ? await joinUrl(appt, { name: appt.patient.firstName, isOwner: false }) : null;
  if (!url) {
    return (
      <Notice
        title="The call isn't open"
        text="Your doctor hasn't opened the call yet, or it has closed. Keep this page and try again when your doctor texts you."
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
