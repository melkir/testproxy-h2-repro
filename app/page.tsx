import { sanityFetch } from "@/sanity/live";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data } = await sanityFetch({ query: '*[_type == "settings"][0]' });
  return <p>{JSON.stringify(data)}</p>;
}
