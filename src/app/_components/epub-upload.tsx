"use client";

import { useRef, useState } from "react";
import { api } from "~/trpc/react";

export function EpubUpload() {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = api.useUtils();

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      // Step 1: Get presigned URL from our API
      const tokenRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name }),
      });

      if (!tokenRes.ok) throw new Error("Failed to get upload URL");

      const { signedUrl, key, safeName } = await tokenRes.json();

      // Step 2: Upload directly to R2 (bypasses Vercel)
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": "application/epub+zip" },
      });

      if (!uploadRes.ok) throw new Error("Upload to R2 failed");

      // Step 3: Confirm upload and save to database
      const confirmRes = await fetch("/api/upload", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, safeName }),
      });

      if (!confirmRes.ok) throw new Error("Failed to save book");

      await utils.progress.getAll.invalidate();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".epub"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload(file);
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="rounded-full bg-[hsl(280,100%,70%)] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(280,100%,60%)] disabled:opacity-50"
      >
        {uploading ? "Uploading..." : "Upload EPUB"}
      </button>
    </div>
  );
}
