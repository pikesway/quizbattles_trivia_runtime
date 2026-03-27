/*
  # Create Trivia Images Storage Bucket
  
  1. New Storage
    - Creates `trivia-images` storage bucket for storing uploaded images
    - Used for shell backgrounds, question images, and other visual assets
  
  2. Security
    - Public read access for serving images
    - Authenticated write access for admins only
    - File size limit of 5MB
    - Allowed MIME types: image/jpeg, image/png, image/gif, image/webp
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trivia-images',
  'trivia-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access for trivia images"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'trivia-images');

CREATE POLICY "Authenticated users can upload trivia images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'trivia-images');

CREATE POLICY "Authenticated users can update their trivia images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'trivia-images')
  WITH CHECK (bucket_id = 'trivia-images');

CREATE POLICY "Authenticated users can delete trivia images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'trivia-images');