-- Tên file upload trước khi đặt `defParamCharset: 'utf8'` bị Multer giải mã theo latin1; chỉ sửa tên mà các byte đọc lại là UTF-8 hợp lệ.
UPDATE "files"
SET "original_name" = convert_from(convert_to("original_name", 'LATIN1'), 'UTF8')
WHERE "original_name" ~ '[\x80-\xFF]'
  AND "original_name" ~ '(?x) ^(
      [\x01-\x7F]
    | [\xC2-\xDF][\x80-\xBF]
    | \xE0[\xA0-\xBF][\x80-\xBF]
    | [\xE1-\xEC][\x80-\xBF]{2}
    | \xED[\x80-\x9F][\x80-\xBF]
    | [\xEE-\xEF][\x80-\xBF]{2}
    | \xF0[\x90-\xBF][\x80-\xBF]{2}
    | [\xF1-\xF3][\x80-\xBF]{3}
    | \xF4[\x80-\x8F][\x80-\xBF]{2}
  )*$';
