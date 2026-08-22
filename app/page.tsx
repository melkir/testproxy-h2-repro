export const dynamic = "force-dynamic";

export default async function Home() {
  const result = await fetch("https://api.github.com/zen")
    .then(async (r) => ({ status: r.status, body: (await r.text()).slice(0, 30) }))
    .catch((e: any) => ({ error: String(e), cause: e?.cause ? String(e.cause) : undefined }));
  return <p>{JSON.stringify(result)}</p>;
}
