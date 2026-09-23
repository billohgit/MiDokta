import { requireUser } from "@/lib/auth";
import { toProfile } from "@/lib/people";
import { STAFF_PORTAL_ROLES } from "@/lib/roles";
import ProfileSettings from "@/components/settings/ProfileSettings";

export const dynamic = "force-dynamic";

export default async function StaffSettingsPage() {
  const staff = await requireUser(...STAFF_PORTAL_ROLES);
  return <ProfileSettings profile={toProfile(staff)} />;
}
