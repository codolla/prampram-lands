-- Add avatar_url to landowners for profile photos
ALTER TABLE public.landowners ADD COLUMN IF NOT EXISTS avatar_url text;

-- Create public avatars storage bucket for landowner & user profile photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Public read for avatars
DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Authenticated users can upload to avatars bucket
DROP POLICY IF EXISTS "avatars authenticated upload" ON storage.objects;
CREATE POLICY "avatars authenticated upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- Authenticated users can update objects in avatars bucket
DROP POLICY IF EXISTS "avatars authenticated update" ON storage.objects;
CREATE POLICY "avatars authenticated update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars');

-- Authenticated users can delete objects in avatars bucket
DROP POLICY IF EXISTS "avatars authenticated delete" ON storage.objects;
CREATE POLICY "avatars authenticated delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');