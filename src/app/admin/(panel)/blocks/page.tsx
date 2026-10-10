import BlocksEditor from "./BlocksEditor";

export const metadata = { title: "Page blocks" };

export default function BlocksPage({ searchParams }: { searchParams: { section?: string } }) {
  return <BlocksEditor section={searchParams.section} />;
}
