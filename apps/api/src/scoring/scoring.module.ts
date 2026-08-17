import { Module } from '@nestjs/common';
import { ScoringAdminController } from './scoring-admin.controller';

@Module({ controllers: [ScoringAdminController] })
export class ScoringModule {}
