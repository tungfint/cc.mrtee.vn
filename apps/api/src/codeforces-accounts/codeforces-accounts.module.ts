import { Module } from '@nestjs/common';
import { CodeforcesAccountsController } from './codeforces-accounts.controller';
import { CodeforcesAccountsService } from './codeforces-accounts.service';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [SyncModule],
  controllers: [CodeforcesAccountsController],
  providers: [CodeforcesAccountsService],
  exports: [CodeforcesAccountsService],
})
export class CodeforcesAccountsModule {}
