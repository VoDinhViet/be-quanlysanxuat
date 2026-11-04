// `@nestjs/swagger` không mở `dist/constants` trong `exports` nên không import được `DECORATORS`;
// các khoá dưới đây khớp `node_modules/@nestjs/swagger/dist/constants.js` (tiền tố `swagger`).
export const SWAGGER_API_OPERATION = 'swagger/apiOperation';
export const SWAGGER_API_MODEL_PROPERTIES = 'swagger/apiModelProperties';
export const SWAGGER_API_MODEL_PROPERTIES_ARRAY =
  'swagger/apiModelPropertiesArray';
