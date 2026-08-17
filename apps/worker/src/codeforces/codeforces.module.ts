import { Module } from '@nestjs/common';
import { CodeforcesClient } from './codeforces.client';
import { GlobalRateLimiter } from './global-rate-limiter';

@Module({ providers: [GlobalRateLimiter, CodeforcesClient], exports: [CodeforcesClient] })
export class CodeforcesModule {}
