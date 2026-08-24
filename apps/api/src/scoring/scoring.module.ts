import { Module } from '@nestjs/common';
import { ScoringAdminController } from './scoring-admin.controller';
import { ScoringAdjustmentsService } from './scoring-adjustments.service';
import { BulkPointImportController } from './bulk-point-import.controller';
import { BulkPointImportService } from './bulk-point-import.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { CcLevelRecalibrationController } from './cc-level-recalibration.controller';
import { CcLevelRecalibrationService } from './cc-level-recalibration.service';
import { LevelRankAwardsService } from './level-rank-awards.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ScoringAdminController, BulkPointImportController, CcLevelRecalibrationController],
  providers: [
    ScoringAdjustmentsService,
    BulkPointImportService,
    CcLevelRecalibrationService,
    LevelRankAwardsService,
  ],
})
export class ScoringModule {}
