import { Module } from '@nestjs/common';
import { ScoringAdminController } from './scoring-admin.controller';
import { ScoringAdjustmentsService } from './scoring-adjustments.service';
import { BulkPointImportController } from './bulk-point-import.controller';
import { BulkPointImportService } from './bulk-point-import.service';

@Module({
  controllers: [ScoringAdminController, BulkPointImportController],
  providers: [ScoringAdjustmentsService, BulkPointImportService],
})
export class ScoringModule {}
