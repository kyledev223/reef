import { ReefApp } from "@/components/ReefApp";
import { getWorld } from "@/lib/world";

export const dynamic = "force-dynamic";

export default async function ReefPage() {
  const world = await getWorld().catch((err) => {
    console.error("Could not load world from the database:", err);
    return null;
  });
  return <ReefApp initialWorld={world} />;
}
