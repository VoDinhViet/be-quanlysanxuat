import { applyDecorators } from '@nestjs/common';
import { Constructor } from '../common/types/types';
import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsDate,
  IsDefined,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsJWT,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
  ValidateNested,
} from 'class-validator';
import { ToBoolean, ToLowerCase, ToUpperCase } from './transform.decorators';
import { IsNullable } from './validators/is-nullable.decorator';

interface IFieldOptions {
  each?: boolean;
  swagger?: boolean;
  nullable?: boolean;
  groups?: string[];
}

interface INumberFieldOptions extends IFieldOptions {
  min?: number;
  max?: number;
  int?: boolean;
  isPositive?: boolean;
  isIn?: readonly number[];
}

interface IStringFieldOptions extends IFieldOptions {
  minLength?: number;
  maxLength?: number;
  toLowerCase?: boolean;
  toUpperCase?: boolean;
  pattern?: RegExp;
  patternMessage?: string;
}

interface IEnumFieldOptions extends IFieldOptions {
  enumName?: string;
}

type IBooleanFieldOptions = IFieldOptions;
type ITokenFieldOptions = IFieldOptions;

interface IClassFieldOptions extends IFieldOptions {
  minItems?: number;
}

export function NumberField(
  options: Omit<ApiPropertyOptions, 'type'> & INumberFieldOptions = {},
): PropertyDecorator {
  const decorators = [Type(() => Number)];

  if (options.nullable) {
    decorators.push(IsNullable({ each: options.each }));
  } else {
    decorators.push(NotEquals(null, { each: options.each }));
  }

  if (options.swagger !== false) {
    const { required = true, ...restOptions } = options;
    decorators.push(
      ApiProperty({
        type: Number,
        required: !!required,
        ...restOptions,
        ...(options.isIn ? { enum: options.isIn } : {}),
      }),
    );
  }

  if (options.int) {
    decorators.push(IsInt({ each: options.each }));
  } else {
    decorators.push(IsNumber({}, { each: options.each }));
  }

  if (typeof options.min === 'number') {
    decorators.push(Min(options.min, { each: options.each }));
  }

  if (typeof options.max === 'number') {
    decorators.push(Max(options.max, { each: options.each }));
  }

  if (options.isPositive) {
    decorators.push(IsPositive({ each: options.each }));
  }

  if (options.isIn) {
    decorators.push(IsIn(options.isIn, { each: options.each }));
  }

  return applyDecorators(...decorators);
}

export function NumberFieldOptional(
  options: Omit<ApiPropertyOptions, 'type' | 'required'> &
    INumberFieldOptions = {},
): PropertyDecorator {
  return applyDecorators(
    IsOptional({ each: options.each }),
    NumberField({ required: false, ...options }),
  );
}

export function StringField(
  options: Omit<ApiPropertyOptions, 'type'> & IStringFieldOptions = {},
): PropertyDecorator {
  const decorators = [Type(() => String), IsString({ each: options.each })];

  if (options.nullable) {
    decorators.push(IsNullable({ each: options.each }));
  } else {
    decorators.push(NotEquals(null, { each: options.each }));
  }

  if (options.swagger !== false) {
    const { required = true, ...restOptions } = options;
    decorators.push(
      ApiProperty({
        type: String,
        required: !!required,
        ...restOptions,
        isArray: options.each,
      }),
    );
  }

  const minLength = options.minLength || 1;

  decorators.push(MinLength(minLength, { each: options.each }));

  if (options.maxLength) {
    decorators.push(MaxLength(options.maxLength, { each: options.each }));
  }

  if (options.pattern) {
    decorators.push(
      Matches(options.pattern, {
        each: options.each,
        message: options.patternMessage,
      }),
    );
  }

  if (options.toLowerCase) {
    decorators.push(ToLowerCase());
  }

  if (options.toUpperCase) {
    decorators.push(ToUpperCase());
  }

  return applyDecorators(...decorators);
}

export function TokenField(
  options: Omit<ApiPropertyOptions, 'type'> & ITokenFieldOptions = {},
): PropertyDecorator {
  const decorators = [Type(() => String), IsJWT({ each: options.each })];

  if (options.nullable) {
    decorators.push(IsNullable({ each: options.each }));
  } else {
    decorators.push(NotEquals(null, { each: options.each }));
  }

  if (options.swagger !== false) {
    const { required = true, ...restOptions } = options;
    decorators.push(
      ApiProperty({
        type: String,
        required: !!required,
        ...restOptions,
        isArray: options.each,
      }),
    );
  }

  return applyDecorators(...decorators);
}

export function StringFieldOptional(
  options: Omit<ApiPropertyOptions, 'type' | 'required'> &
    IStringFieldOptions = {},
): PropertyDecorator {
  return applyDecorators(
    IsOptional({ each: options.each }),
    StringField({ required: false, ...options }),
  );
}

export function PasswordField(
  options: Omit<ApiPropertyOptions, 'type' | 'minLength'> &
    IStringFieldOptions = {},
): PropertyDecorator {
  const decorators = [StringField({ ...options, minLength: 6 })];

  if (options.nullable) {
    decorators.push(IsNullable());
  } else {
    decorators.push(NotEquals(null));
  }

  return applyDecorators(...decorators);
}

export function PasswordFieldOptional(
  options: Omit<ApiPropertyOptions, 'type' | 'required' | 'minLength'> &
    IStringFieldOptions = {},
): PropertyDecorator {
  return applyDecorators(
    IsOptional({ each: options.each }),
    PasswordField({ required: false, ...options }),
  );
}

export function BooleanField(
  options: Omit<ApiPropertyOptions, 'type'> & IBooleanFieldOptions = {},
): PropertyDecorator {
  const decorators = [ToBoolean(), IsBoolean()];

  if (options.nullable) {
    decorators.push(IsNullable());
  } else {
    decorators.push(NotEquals(null));
  }

  if (options.swagger !== false) {
    const { required = true, ...restOptions } = options;
    decorators.push(
      ApiProperty({ type: Boolean, required: !!required, ...restOptions }),
    );
  }

  return applyDecorators(...decorators);
}

export function BooleanFieldOptional(
  options: Omit<ApiPropertyOptions, 'type' | 'required'> &
    IBooleanFieldOptions = {},
): PropertyDecorator {
  return applyDecorators(
    IsOptional({ each: options.each }),
    BooleanField({ required: false, ...options }),
  );
}

export function EmailField(
  options: Omit<ApiPropertyOptions, 'type'> & IStringFieldOptions = {},
): PropertyDecorator {
  const decorators = [
    IsEmail(),
    StringField({ toLowerCase: true, ...options }),
  ];

  if (options.nullable) {
    decorators.push(IsNullable());
  } else {
    decorators.push(NotEquals(null));
  }

  if (options.swagger !== false) {
    const { required = true, ...restOptions } = options;
    decorators.push(
      ApiProperty({ type: String, required: !!required, ...restOptions }),
    );
  }

  return applyDecorators(...decorators);
}

export function EmailFieldOptional(
  options: Omit<ApiPropertyOptions, 'type'> & IStringFieldOptions = {},
): PropertyDecorator {
  return applyDecorators(
    IsOptional({ each: options.each }),
    EmailField({ required: false, ...options }),
  );
}

// Chỉ chặn ký tự rõ ràng không phải số điện thoại (chữ cái, ...) — không giới hạn riêng số VN,
// nhận cả số quốc tế: `+` đầu (tuỳ chọn) rồi 8-15 chữ số (độ dài tối đa theo chuẩn E.164).
const PHONE_NUMBER_PATTERN = /^\+?\d{8,15}$/;
const PHONE_NUMBER_MESSAGE =
  'Số điện thoại không hợp lệ — chỉ nhận chữ số (có thể có dấu "+" ở đầu), 8-15 chữ số.';

export function PhoneField(
  options: Omit<ApiPropertyOptions, 'type'> & IStringFieldOptions = {},
): PropertyDecorator {
  return StringField({
    ...options,
    pattern: PHONE_NUMBER_PATTERN,
    patternMessage: PHONE_NUMBER_MESSAGE,
  });
}

export function PhoneFieldOptional(
  options: Omit<ApiPropertyOptions, 'type' | 'required'> &
    IStringFieldOptions = {},
): PropertyDecorator {
  return applyDecorators(
    IsOptional({ each: options.each }),
    PhoneField({ required: false, ...options }),
  );
}

export function UUIDField(
  options: Omit<ApiPropertyOptions, 'type' | 'format' | 'isArray'> &
    IFieldOptions = {},
): PropertyDecorator {
  const decorators = [Type(() => String), IsUUID('4', { each: options.each })];

  if (options.nullable) {
    decorators.push(IsNullable());
  } else {
    decorators.push(NotEquals(null));
  }

  if (options.swagger !== false) {
    const { required = true, ...restOptions } = options;
    decorators.push(
      ApiProperty({
        type: options.each ? [String] : String,
        format: 'uuid',
        isArray: options.each,
        required: !!required,
        ...restOptions,
      }),
    );
  }

  return applyDecorators(...decorators);
}

export function UUIDFieldOptional(
  options: Omit<ApiPropertyOptions, 'type' | 'required' | 'isArray'> &
    IFieldOptions = {},
): PropertyDecorator {
  return applyDecorators(
    IsOptional({ each: options.each }),
    UUIDField({ required: false, ...options }),
  );
}

export function URLField(
  options: Omit<ApiPropertyOptions, 'type'> & IStringFieldOptions = {},
): PropertyDecorator {
  const decorators = [StringField(options), IsUrl({}, { each: true })];

  if (options.nullable) {
    decorators.push(IsNullable({ each: options.each }));
  } else {
    decorators.push(NotEquals(null, { each: options.each }));
  }

  return applyDecorators(...decorators);
}

export function URLFieldOptional(
  options: Omit<ApiPropertyOptions, 'type'> & IStringFieldOptions = {},
): PropertyDecorator {
  return applyDecorators(
    IsOptional({ each: options.each }),
    URLField({ required: false, ...options }),
  );
}

export function DateField(
  options: Omit<ApiPropertyOptions, 'type'> & IFieldOptions = {},
): PropertyDecorator {
  const decorators = [Type(() => Date), IsDate()];

  if (options.nullable) {
    decorators.push(IsNullable());
  } else {
    decorators.push(NotEquals(null));
  }

  if (options.swagger !== false) {
    const { required = true, ...restOptions } = options;
    decorators.push(
      ApiProperty({ type: Date, required: !!required, ...restOptions }),
    );
  }

  return applyDecorators(...decorators);
}

export function DateFieldOptional(
  options: Omit<ApiPropertyOptions, 'type' | 'required'> & IFieldOptions = {},
): PropertyDecorator {
  return applyDecorators(
    IsOptional({ each: options.each }),
    DateField({ ...options, required: false }),
  );
}

export function EnumField<TEnum extends object>(
  getEnum: () => TEnum,
  options: Omit<ApiPropertyOptions, 'type' | 'enum' | 'isArray'> &
    IEnumFieldOptions = {},
): PropertyDecorator {
  const decorators = [IsEnum(getEnum(), { each: options.each })];

  if (options.nullable) {
    decorators.push(IsNullable());
  } else {
    decorators.push(NotEquals(null));
  }

  if (options.swagger !== false) {
    const { required = true, ...restOptions } = options;
    decorators.push(
      ApiProperty({
        enum: getEnum(),
        enumName: options.enumName || getVariableName(getEnum),
        isArray: options.each,
        required: !!required,
        ...restOptions,
      }),
    );
  }

  return applyDecorators(...decorators);
}

export function EnumFieldOptional<TEnum extends object>(
  getEnum: () => TEnum,
  options: Omit<ApiPropertyOptions, 'type' | 'required' | 'enum'> &
    IEnumFieldOptions = {},
): PropertyDecorator {
  return applyDecorators(
    IsOptional({ each: options.each }),
    EnumField(getEnum, { required: false, ...options }),
  );
}

export function ClassField<TClass extends Constructor>(
  getClass: () => TClass,
  options: Omit<ApiPropertyOptions, 'type'> & IClassFieldOptions = {},
): PropertyDecorator {
  const decorators = [
    Type(() => getClass()),
    ValidateNested({ each: options.each }),
  ];

  if (options.required !== false) {
    decorators.push(IsDefined());
  }

  if (options.nullable) {
    decorators.push(IsNullable());
  } else {
    decorators.push(NotEquals(null));
  }

  if (typeof options.minItems === 'number') {
    decorators.push(ArrayMinSize(options.minItems));
  }

  if (options.swagger !== false) {
    const { required = true, ...restOptions } = options;
    decorators.push(
      ApiProperty({
        type: () => getClass(),
        required: !!required,
        ...restOptions,
      }),
    );
  }

  return applyDecorators(...decorators);
}

export function ClassFieldOptional<TClass extends Constructor>(
  getClass: () => TClass,
  options: Omit<ApiPropertyOptions, 'type' | 'required'> &
    IClassFieldOptions = {},
): PropertyDecorator {
  return applyDecorators(
    IsOptional({ each: options.each }),
    ClassField(getClass, { required: false, ...options }),
  );
}

function getVariableName(variableFunction: () => any) {
  return variableFunction.toString().split('.').pop();
}
