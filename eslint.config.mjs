// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Tên chung chung bị cấm bởi `.claude/rules/naming.md`; `item`/`items` không cấm vì bảng `items` có thật.
const GENERIC_NAME_PATTERN = '^(rows|row|data|result|res|list|entries|r|x|tmp)$';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // `ignoreRestSiblings`: cho phép pattern "loại cột khỏi object trước khi spread"
      // (`const { code: _, createdAt, updatedAt, ...copyFields } = row`) — các field bị loại phải
      // được đặt tên để tách khỏi `...rest`, nhưng bản thân chúng không cần dùng tới. Dùng ở
      // `ItemsService.copyItem`/`copyBomTree`, cùng khuôn `ProductsService.copyProduct` cũ.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  {
    // `users` giờ được ~15 bảng khác cùng trỏ vào qua `.references(() => users.id)`/`one(users,
    // ...)` (đảo hướng FK audit toàn hệ thống sang users.id, 2026-08-01). Khi lint TOÀN DỰ ÁN cùng
    // lúc, `typescript-eslint`'s type-aware checker suy sai `users.id` (và một vài cột khác cùng
    // schema) thành `any` tại mọi nơi đọc/ghi nó — kể cả tầng service/seed, không chỉ schema — chỉ
    // xảy ra khi nhiều file được xử lý chung một lượt (đã xác minh: từng file lint riêng lẻ sạch
    // 100%, và `npx tsc --noEmit` sạch 100% cho toàn dự án). Đây là giới hạn của công cụ suy luận
    // kiểu qua nhiều file, không phải lỗ hổng an toàn kiểu thật — `tsc --noEmit` vẫn là cổng kiểm
    // type chính thức, không bị nới lỏng bởi override này. Phạm vi: chỉ tầng chạm trực tiếp schema
    // (service đọc/ghi DB, seed), không đụng controller/DTO/decorator. `**/types/*.type.ts` cùng
    // nhóm — các type dựng từ `typeof <table>.$inferSelect` của bảng chạm `users` (vd `files` qua
    // `uploader`) hứng đúng lỗi tương tự, dạng `no-redundant-type-constituents` thay vì `no-unsafe-*`.
    files: [
      'src/database/schemas/**/*.ts',
      'src/database/seeds/**/*.ts',
      'src/api/**/*.service.ts',
      'src/api/**/types/*.type.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },
  {
    // Mức `warn` để code cũ chưa đổi tên không chặn `pnpm lint`; sửa dần khi chạm file.
    // `*.export.ts` miễn trừ vì `row` ở đó đúng nghĩa là một dòng của sheet.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.export.ts', 'src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: ['variable', 'parameter'],
          format: null,
          custom: { regex: GENERIC_NAME_PATTERN, match: false },
        },
      ],
    },
  },
);
