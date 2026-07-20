import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const SIGNED_URL_EXPIRY_SECONDS = 3600;

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
): Promise<{ url: string | null; filePath: string | null; error: string | null }> {
  const validationError = validateFile(file);
  if (validationError) return { url: null, filePath: null, error: validationError };

  const supabase = createClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${clinicId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from("documents")
    .upload(filePath, file, { upsert: false });

  if (error) {
    return { url: null, filePath: null, error: error.message };
  }

  const { data: signedData } = await supabase.storage
    .from("documents")
    .createSignedUrl(filePath, SIGNED_URL_EXPIRY_SECONDS);

  return { url: signedData?.signedUrl ?? null, filePath, error: null };
}
