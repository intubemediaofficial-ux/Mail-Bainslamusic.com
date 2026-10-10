import { getSettings } from "@/lib/content";
import SettingsForm from "./SettingsForm";

export const metadata = { title: "Site settings" };

export default async function SettingsPage() {
  const settings = await getSettings();
  return <SettingsForm initial={settings} />;
}
