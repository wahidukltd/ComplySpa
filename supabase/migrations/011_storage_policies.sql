DROP POLICY IF EXISTS "storage_upload_documents" ON storage.objects;
CREATE POLICY "storage_upload_documents" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = (SELECT auth_clinic_id())::text
    AND storage.extension(name) IN ('jpg', 'jpeg', 'png', 'webp', 'pdf')
    AND (metadata->>'size')::bigint <= 10485760
  );

DROP POLICY IF EXISTS "storage_read_documents" ON storage.objects;
CREATE POLICY "storage_read_documents" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = (SELECT auth_clinic_id())::text
  );
