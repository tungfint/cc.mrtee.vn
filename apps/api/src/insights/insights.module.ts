import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller';
import { LeaderboardLinksController } from './leaderboard-links.controller';
import { RewardsModule } from '../rewards/rewards.module';
import { RecognitionImageService } from './recognition-image.service';

@Module({
  imports: [RewardsModule],
  controllers: [InsightsController, LeaderboardLinksController],
  providers: [RecognitionImageService],
})
export class InsightsModule {}
