import { registerAs } from '@nestjs/config';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

import { AiConfig } from './ai-config.type';
import validateConfig from '../../../utils/validate-config';

class EnvironmentVariablesValidator {
  @IsString()
  OPENROUTER_API_KEY!: string;

  @IsString()
  @IsOptional()
  AI_MODEL?: string;

  @IsNumber()
  @Min(0)
  @Max(2)
  @IsOptional()
  AI_TEMPERATURE?: number;
}

export default registerAs<AiConfig>('ai', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    openRouterApiKey: process.env.OPENROUTER_API_KEY!,
    model: process.env.AI_MODEL || 'deepseek/deepseek-v4-flash',
    temperature: process.env.AI_TEMPERATURE
      ? parseFloat(process.env.AI_TEMPERATURE)
      : 0,
  };
});
