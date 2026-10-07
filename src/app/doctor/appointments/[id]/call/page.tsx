import { redirect } from "next/navigation";

/** Old video call address (from notifications sent before calls rang in the app): go to the visit. */
export default async function OldCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/doctor/appointments/${id}`);
}
