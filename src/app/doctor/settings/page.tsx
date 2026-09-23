import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { toProfile } from "@/lib/people";
import ProfileSettings from "@/components/settings/ProfileSettings";

export const dynamic = "force-dynamic";

export default async function DoctorSettingsPage() {
  const doctor = await requireUser(Role.DOCTOR);
  return <ProfileSettings profile={toProfile(doctor)} />;
}
