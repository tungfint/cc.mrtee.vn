import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller';
import { LeaderboardLinksController } from './leaderboard-links.controller';
import { RewardsModule } from '../rewards/rewards.module';

@Module({ imports: [RewardsModule], controllers: [InsightsController, LeaderboardLinksController] })
export class InsightsModule {}
