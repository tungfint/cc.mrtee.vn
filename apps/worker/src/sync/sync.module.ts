import { Module } from '@nestjs/common';
import { CodeforcesModule } from '../codeforces/codeforces.module';
import { SyncWorkerService } from './sync-worker.service';
import { IngestionModule } from '../ingestion/ingestion.module';
import { FirstSolveModule } from '../first-solve/first-solve.module';

@Module({
  imports: [CodeforcesModule, IngestionModule, FirstSolveModule],
  providers: [SyncWorkerService],
})
export class SyncModule {}
