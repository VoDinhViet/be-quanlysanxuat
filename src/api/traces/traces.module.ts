import { Module } from '@nestjs/common';

import { TracesController } from './traces.controller';
import { TracesService } from './traces.service';

@Module({
  controllers: [TracesController],
  providers: [TracesService],
})
export class TracesModule {}
