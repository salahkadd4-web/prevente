import { redirect } from "next/navigation";
import { getSessionState, redirectForState } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/auth/roles";

export default async function Home() {
  const state = await getSessionState();

  if (state.status === "ok") redirect(ROLE_HOME[state.profile.role]);
  // Visiteur non connecté : simple passage par la page de connexion, sans message.
  if (state.status === "anonymous") redirect("/login");
  redirectForState(state);
}
