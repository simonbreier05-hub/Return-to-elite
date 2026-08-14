import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

const HOME_BY_ROLE: Record<string, string> = {
  room_attendant: "/attendant",
  supervisor: "/supervisor",
  duty_manager: "/supervisor",
  front_office: "/front-office",
  concierge: "/concierge",
  engineering: "/engineering",
};

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(HOME_BY_ROLE[session.role] ?? "/login");
}
