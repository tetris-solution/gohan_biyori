CREATE TABLE IF NOT EXISTS creator_categories (
 user_id TEXT NOT NULL REFERENCES creator_profiles(user_id) ON DELETE CASCADE,
 category TEXT NOT NULL,
 PRIMARY KEY(user_id,category)
);
CREATE TABLE IF NOT EXISTS community_groups (
 group_id TEXT PRIMARY KEY REFERENCES sharing_groups(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS commerce_recipes (
 product_id TEXT NOT NULL REFERENCES commerce_products(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id),
 recipe_id INTEGER NOT NULL,
 data TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(product_id,user_id,recipe_id)
);
