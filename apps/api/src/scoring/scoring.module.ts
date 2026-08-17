import { Module } from '@nestjs/common';
import { ScoringAdminController } from './scoring-admin.controller';
import { ScoringAdjustmentsService } from './scoring-adjustments.service';

@Module({ controllers: [ScoringAdminController], providers: [ScoringAdjustmentsService] })
export class ScoringModule {}
