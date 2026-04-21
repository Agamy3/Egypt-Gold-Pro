-- Create storage bucket for business card images
-- This creates the bucket and sets up appropriate policies

-- Insert storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-card-images',
  'business-card-images',
  true,
  5242880, -- 5MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

-- Create policy to allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload to their own business card folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'business-card-images'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1]::text = auth.uid()::text
);

-- Create policy to allow authenticated users to update their own files
CREATE POLICY "Users can update their own business card images"
ON storage.objects FOR UPDATE
WITH CHECK (
  bucket_id = 'business-card-images'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1]::text = auth.uid()::text
);

-- Create policy to allow authenticated users to delete their own files
CREATE POLICY "Users can delete their own business card images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'business-card-images'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1]::text = auth.uid()::text
);

-- Create policy to allow public read access to all images (since business cards are public)
CREATE POLICY "Public read access to business card images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'business-card-images'
);

-- Create policy to allow admins to manage all business card images
CREATE POLICY "Admins can insert business card images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'business-card-images'
  AND EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_profiles.id::text = auth.uid()::text 
    AND user_profiles.is_admin = true
  )
);

CREATE POLICY "Admins can update business card images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'business-card-images'
  AND EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_profiles.id::text = auth.uid()::text 
    AND user_profiles.is_admin = true
  )
)
WITH CHECK (
  bucket_id = 'business-card-images'
  AND EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_profiles.id::text = auth.uid()::text 
    AND user_profiles.is_admin = true
  )
);

CREATE POLICY "Admins can delete business card images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'business-card-images'
  AND EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_profiles.id::text = auth.uid()::text 
    AND user_profiles.is_admin = true
  )
);

-- Verify bucket was created
SELECT 
  id, 
  name, 
  public, 
  file_size_limit,
  allowed_mime_types
FROM storage.buckets 
WHERE id = 'business-card-images';
