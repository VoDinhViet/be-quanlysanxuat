import { Transform } from 'class-transformer';
import { castArray, isNil, trim } from 'lodash';

export function ToBoolean(): PropertyDecorator {
  return Transform(
    (params) => {
      switch (params.value) {
        case 'true':
          return true;
        case 'false':
          return false;
        default:
          return params.value;
      }
    },
    { toClassOnly: true },
  );
}

export function ToLowerCase(): PropertyDecorator {
  return Transform(
    (params) => {
      const value = params.value;

      if (!value) {
        return value;
      }

      if (!Array.isArray(value)) {
        return value.toLowerCase();
      }

      return value.map((v) => v.toLowerCase());
    },
    { toClassOnly: true },
  );
}

export function ToUpperCase(): PropertyDecorator {
  return Transform(
    (params) => {
      const value = params.value;

      if (!value) {
        return value;
      }

      if (!Array.isArray(value)) {
        return value.toUpperCase();
      }

      return value.map((v) => v.toUpperCase());
    },
    { toClassOnly: true },
  );
}

export function Trim(): PropertyDecorator {
  return Transform((params) => {
    const value = params.value;

    if (isNil(value)) {
      return value;
    }

    if (Array.isArray(value)) {
      return castArray(value).map((v) => trim(v));
    }

    return trim(value);
  });
}

export function ToFileUrl(): PropertyDecorator {
  return Transform(({ value }) => {
    if (value && typeof value === 'string' && !value.startsWith('http')) {
      const backendDomain =
        process.env.BACKEND_DOMAIN || 'http://localhost:8003';
      console.log(`${backendDomain}/${value.replace(/^\//, '')}`);
      return `${backendDomain}/${value.replace(/^\//, '')}`;
    }
    return value;
  });
}
