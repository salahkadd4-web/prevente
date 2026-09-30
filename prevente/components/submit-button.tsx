"use client";

import { useFormStatus } from "react-dom";

/** Bouton de soumission avec état de chargement (à placer dans un <form>). */
export default function SubmitButton({
  children,
  pendingLabel = "Patientez…",
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
