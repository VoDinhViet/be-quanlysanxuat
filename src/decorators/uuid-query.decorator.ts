import { Query } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

export function UUIDQuery(
  name: string,
  options: { required?: boolean; description?: string } = {},
): ParameterDecorator {
  return (target: object, key: string | symbol | undefined, index: number) => {
    ApiQuery({
      name,
      type: String,
      required: options.required ?? false,
      description: options.description,
      example: '3fa85f64-5717-4562-b3fc-2c963f66afa6 (hoặc mã Code)',
    })(target, key!, Object.getOwnPropertyDescriptor(target, key!)!);

    Query(name)(target, key, index);
  };
}
