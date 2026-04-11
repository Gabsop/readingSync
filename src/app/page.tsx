export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 text-white">
      <h1 className="text-4xl font-bold tracking-tight">ReadingSync</h1>
      <p className="mt-4 text-lg text-white/60">
        API server for reading progress sync
      </p>
      <div className="mt-8 flex flex-col items-center gap-2 text-sm text-white/40">
        <p>POST /api/progress — sync reading position</p>
        <p>GET /api/progress/:bookId — fetch position</p>
        <p>POST /api/upload — get presigned upload URL</p>
      </div>
    </main>
  );
}
