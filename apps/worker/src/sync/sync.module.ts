import { Module } from '@nestjs/common';
import { CodeforcesModule } from '../codeforces/codeforces.module';
import { SyncWorkerService } from './sync-worker.service';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({ imports: [CodeforcesModule, IngestionModule], providers: [SyncWorkerService] })
export class SyncModule {}
