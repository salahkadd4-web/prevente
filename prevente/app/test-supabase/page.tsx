import { createClient } from "@/lib/supabase/server";

export default async function TestSupabasePage() {
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .select("id")
    .limit(1);

  if (error) {
    return (
      <main className="p-8">
        <h1 className="text-xl font-bold text-red-600">
          Connexion échouée
        </h1>

        <p className="mt-4">{error.message}</p>
      </main>
    );
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-green-600">
        Supabase connecté !
      </h1>

      <p className="mt-4">
        La communication avec la base de données fonctionne.
      </p>
    </main>
  );
}