import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller';
import { LeaderboardLinksController } from './leaderboard-links.controller';

@Module({ controllers: [InsightsController, LeaderboardLinksController] })
export class InsightsModule {}
