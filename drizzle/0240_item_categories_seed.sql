-- Custom SQL migration file, put your code below! --
-- Nhóm vật tư ví dụ để người dùng có sẵn danh mục; sửa/xoá được trên màn Nhóm vật tư.
INSERT INTO item_categories (code, name) VALUES
  ('VT-MAI', 'Vật tư mài'),
  ('VT-HAN', 'Vật tư hàn'),
  ('VT-SON', 'Vật tư sơn'),
  ('BULONG', 'Bulong'),
  ('THEP', 'Thép')
ON CONFLICT (code) DO NOTHING;
