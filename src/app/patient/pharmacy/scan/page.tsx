import Link from "next/link";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import PrescriptionScanner from "@/components/pharmacy/PrescriptionScanner";

export const dynamic = "force-dynamic";

/** A patient photographs their prescription and orders the medicines on it. */
export default async function ScanPrescriptionPage() {
  await requireUser(Role.PATIENT);
  return (
    <div className="settings">
      <Link href="/patient/pharmacy" className="back-link">
        <i className="fa-solid fa-arrow-left" /> Pharmacy
      </Link>
      <h2 className="section-heading">Scan a Prescription</h2>
      <p className="section-sub">Take a photo of your prescription and we&apos;ll find the medicines on it.</p>
      <PrescriptionScanner mode="patient" />
    </div>
  );
}
