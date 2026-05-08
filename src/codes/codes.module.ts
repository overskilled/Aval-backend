import { Module } from '@nestjs/common';
import { CodesService } from './codes.service';
import { BatchExportService } from './batch-export.service';

@Module({
  providers: [CodesService, BatchExportService],
  exports: [CodesService, BatchExportService],
})
export class CodesModule {}
