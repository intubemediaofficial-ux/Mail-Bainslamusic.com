import CampaignDetail from "@/components/intubtool/CampaignDetail";

export const metadata = { title: "Campaign" };

export default function Page({ params }: { params: { id: string } }) {
  return <CampaignDetail id={params.id} />;
}
