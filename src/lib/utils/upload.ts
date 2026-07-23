import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return "File must be under 10MB.";
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Only JPG, PNG, WebP, and PDF files are allowed.";
  }
  return null;
}

export async function uploadDocument(
  file: File,
  clinicId: string,
): Promise<{ filePath: string | null; error: string | null }> {
  const validationError = validateFile(file);
  if (validationError) return { filePath: null, error: validationError };

  const supabase = createClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${clinicId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from("documents")
    .upload(filePath, file, { upsert: false });

  if (error) {
    return { filePath: null, error: error.message };
  }

  return { filePath, error: null };
}

export async function getDocumentUrl(filePath: string | null): Promise<string | null> {
  if (!filePath) return null;
  const supabase = createClient();
  const { data } = await supabase.storage
    .from("documents")
    .createSignedUrl(filePath, 3600);
  return data?.signedUrl ?? null;
}
