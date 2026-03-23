"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { api } from "~/trpc/react";

export function EpubUpload() {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = api.useUtils();

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });
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
