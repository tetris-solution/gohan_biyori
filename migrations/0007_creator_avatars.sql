CREATE TABLE IF NOT EXISTS creator_avatars (
  user_id TEXT PRIMARY KEY REFERENCES creator_profiles(user_id) ON DELETE CASCADE,
  image_id TEXT NOT NULL
);
