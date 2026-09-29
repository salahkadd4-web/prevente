"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/form";

/** Formulaire branché sur une Server Action : affiche l'erreur ou la confirmation. */
export default function ActionForm({
  action,
  children,
  className,
}: {
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionResult);

  return (
    <form action={formAction} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state.error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
          {state.ok}
        </p>
      )}
    </form>
  );
}
