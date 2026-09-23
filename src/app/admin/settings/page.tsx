import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { toProfile } from "@/lib/people";
import ProfileSettings from "@/components/settings/ProfileSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = await requireUser(Role.ADMIN);
  return <ProfileSettings profile={toProfile(admin)} />;
}
