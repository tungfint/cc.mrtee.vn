import { Module } from '@nestjs/common';
import { CodeforcesModule } from '../codeforces/codeforces.module';
import { SyncWorkerService } from './sync-worker.service';
import { IngestionModule } from '../ingestion/ingestion.module';
import { FirstSolveModule } from '../first-solve/first-solve.module';
import { LevelModule } from '../level/level.module';
import { SyncProcessorService } from './sync-processor.service';
import { RewardModule } from '../reward/reward.module';
import { AdaptiveSchedulerService } from './adaptive-scheduler.service';

@Module({
  imports: [CodeforcesModule, IngestionModule, FirstSolveModule, LevelModule, RewardModule],
  providers: [SyncProcessorService, SyncWorkerService, AdaptiveSchedulerService],
})
export class SyncModule {}
