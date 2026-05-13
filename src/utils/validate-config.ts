import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ClassConstructor } from 'class-transformer';

function validateConfig<T extends object>(
  config: Record<string, unknown>,
  envVarsClass: ClassConstructor<T>,
) {
  const validatedConfig = plainToInstance(envVarsClass, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}

export default validateConfig;
