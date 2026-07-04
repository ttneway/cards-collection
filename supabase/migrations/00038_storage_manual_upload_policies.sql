INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'card-images',
  'card-images',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'card_images_public_read'
  ) THEN
    CREATE POLICY card_images_public_read
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'card-images');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'card_images_teacher_upload'
  ) THEN
    CREATE POLICY card_images_teacher_upload
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'card-images'
        AND public.current_user_role() IN ('teacher', 'admin')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'card_images_teacher_update'
  ) THEN
    CREATE POLICY card_images_teacher_update
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'card-images'
        AND public.current_user_role() IN ('teacher', 'admin')
      )
      WITH CHECK (
        bucket_id = 'card-images'
        AND public.current_user_role() IN ('teacher', 'admin')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'card_images_teacher_delete'
  ) THEN
    CREATE POLICY card_images_teacher_delete
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'card-images'
        AND public.current_user_role() IN ('teacher', 'admin')
      );
  END IF;
END $$;
