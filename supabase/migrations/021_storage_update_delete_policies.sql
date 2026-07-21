-- Allow authenticated users to update their own uploaded documents
CREATE POLICY "clinic_storage_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'documents' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth_clinic_id()
  )
  WITH CHECK (
    bucket_id = 'documents' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth_clinic_id()
  );

-- Allow authenticated users to delete their own uploaded documents
CREATE POLICY "clinic_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth_clinic_id()
  );
