import { Role } from "@prisma/client";
import { requireUser, signedInRecently } from "@/lib/auth";
import { displayEmail, toProfile } from "@/lib/people";
import ProfileSettings from "@/components/settings/ProfileSettings";
import PasswordSettings from "@/components/settings/PasswordSettings";

export const dynamic = "force-dynamic";

export default async function PatientSettingsPage() {
  const patient = await requireUser(Role.PATIENT);
  return (
    <ProfileSettings profile={toProfile(patient)}>
      <PasswordSettings askCurrent={!(await signedInRecently())} hasEmail={displayEmail(patient.email) !== null} />
    </ProfileSettings>
  );
}
