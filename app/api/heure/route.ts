import { connection } from "next/server";

// Heure du serveur : l'appli s'en sert à la place de l'horloge du téléphone.
export async function GET() {
  await connection();
  return Response.json({ maintenant: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
