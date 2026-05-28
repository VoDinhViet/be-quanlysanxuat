import { Param, ParseUUIDPipe } from '@nestjs/common';

export const UUIDParam = (property: string) => Param(property, new ParseUUIDPipe({ version: '4' }));
