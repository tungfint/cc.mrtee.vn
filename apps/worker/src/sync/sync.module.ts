import { Module } from '@nestjs/common';
import { CodeforcesModule } from '../codeforces/codeforces.module';
import { SyncWorkerService } from './sync-worker.service';
import { IngestionModule } from '../ingestion/ingestion.module';
import { FirstSolveModule } from '../first-solve/first-solve.module';
import { LevelModule } from '../level/level.module';

@Module({
  imports: [CodeforcesModule, IngestionModule, FirstSolveModule, LevelModule],
  providers: [SyncWorkerService],
})
export class SyncModule {}
