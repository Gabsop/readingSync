import { api, HydrateClient } from "~/trpc/server";
import { EpubReader } from "~/app/_components/epub-reader";

export default async function ReadPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const decoded = decodeURIComponent(bookId);

  void api.progress.getByBookId.prefetch({ bookId: decoded });

  return (
    <HydrateClient>
      <EpubReader bookId={decoded} />
    </HydrateClient>
  );
}
