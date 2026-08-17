import { Module } from '@nestjs/common';
import { CodeforcesAccountsController } from './codeforces-accounts.controller';
import { CodeforcesAccountsService } from './codeforces-accounts.service';

@Module({
  controllers: [CodeforcesAccountsController],
  providers: [CodeforcesAccountsService],
  exports: [CodeforcesAccountsService],
})
export class CodeforcesAccountsModule {}
