import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import { ROLES, roleHome } from "@/lib/domain";
import ChatView from "./view";

/** Chat-Hub — für jede Staff-Rolle; welche Kanäle/Personen sichtbar sind, entscheidet der Server (src/lib/chat/policy.ts). */
export default async function ChatPage() {
  const session = await requirePage([...ROLES]);
  return (
    <AppShell title="chat.title" userName={session.name} role={session.role} backHref={roleHome(session.role)}>
      <ChatView />
    </AppShell>
  );
}
