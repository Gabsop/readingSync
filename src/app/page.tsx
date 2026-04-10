import { headers } from "next/headers";
import { BookList } from "~/app/_components/book-list";
import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  void api.progress.getAll.prefetch();

  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
        <div className="container flex flex-col items-center justify-center gap-8 px-4 py-16">
          <h1 className="text-5xl font-extrabold tracking-tight">
            Reading <span className="text-[hsl(280,100%,70%)]">Sync</span>
          </h1>
          <p className="text-lg text-white/60">
            Track your reading progress across devices
          </p>

          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-white/40">
              {session ? (
                <span>Signed in as {session.user.name}</span>
              ) : (
                <span>Not signed in</span>
              )}
            </p>
          </div>

          <BookList />
        </div>
      </main>
    </HydrateClient>
  );
}
