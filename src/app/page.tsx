import { BookList } from "~/app/_components/book-list";
import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import Link from "next/link";

export default async function Home() {
  const session = await auth();

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
                <span>Signed in as {session.user?.name}</span>
              ) : (
                <span>Not signed in</span>
              )}
            </p>
            <Link
              href={session ? "/api/auth/signout" : "/api/auth/signin"}
              className="rounded-full bg-white/10 px-6 py-2 text-sm font-semibold no-underline transition hover:bg-white/20"
            >
              {session ? "Sign out" : "Sign in"}
            </Link>
          </div>

          <BookList />
        </div>
      </main>
    </HydrateClient>
  );
}
