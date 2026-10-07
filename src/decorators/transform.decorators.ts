import { Transform } from 'class-transformer';
import { isNil, trim } from 'lodash';

export function ToBoolean(): PropertyDecorator {
  return Transform(
    ({ value }: { value: unknown }) => {
      switch (value) {
        case 'true':
          return true;
        case 'false':
          return false;
        default:
          return value;
      }
    },
    { toClassOnly: true },
  );
}

/** Query string dạng CSV (`?type=FG,DIRECT`) → mảng; giá trị đã là mảng (JSON body, `?a=1&a=2`) giữ
 * nguyên. Đặt trên field có `each: true`. */
export function ToArrayFromCsv(): PropertyDecorator {
  return Transform(
    ({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.split(',') : value,
    { toClassOnly: true },
  );
}

/** Áp `convert` lên chuỗi hoặc từng phần tử chuỗi của mảng; giá trị không phải chuỗi giữ nguyên để
 * validator phía sau tự báo lỗi. */
function mapStrings(
  value: unknown,
  convert: (text: string) => string,
): unknown {
  if (typeof value === 'string') {
    return convert(value);
  }

  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) =>
      typeof item === 'string' ? convert(item) : item,
    );
  }

  return value;
}

export function ToLowerCase(): PropertyDecorator {
  return Transform(
    ({ value }: { value: unknown }) =>
      mapStrings(value, (text) => text.toLowerCase()),
    { toClassOnly: true },
  );
}

export function ToUpperCase(): PropertyDecorator {
  return Transform(
    ({ value }: { value: unknown }) =>
      mapStrings(value, (text) => text.toUpperCase()),
    { toClassOnly: true },
  );
}

export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (isNil(value)) {
      return value;
    }

    // lodash `trim` ép phần tử không phải chuỗi về chuỗi, giữ nguyên hành vi đó.
    if (Array.isArray(value)) {
      return (value as unknown[]).map((item) => trim(item as string));
    }

    return trim(value as string);
  });
}

export function ToFileUrl(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value && typeof value === 'string' && !value.startsWith('http')) {
      const backendDomain =
        process.env.BACKEND_DOMAIN || 'http://localhost:8003';
      console.log(`${backendDomain}/${value.replace(/^\//, '')}`);
      return `${backendDomain}/${value.replace(/^\//, '')}`;
    }
    return value;
  });
}
