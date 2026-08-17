import { Module } from '@nestjs/common';
import { CodeforcesModule } from '../codeforces/codeforces.module';
import { SyncWorkerService } from './sync-worker.service';

@Module({ imports: [CodeforcesModule], providers: [SyncWorkerService] })
export class SyncModule {}
