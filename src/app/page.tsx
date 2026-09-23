import { redirect } from "next/navigation";
import { PORTAL_HOME, getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  redirect((user && PORTAL_HOME[user.role]) || "/login");
}
