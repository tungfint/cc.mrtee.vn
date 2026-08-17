import { Module } from '@nestjs/common';
import { SubmissionIngestionService } from './submission-ingestion.service';

@Module({ providers: [SubmissionIngestionService], exports: [SubmissionIngestionService] })
export class IngestionModule {}
