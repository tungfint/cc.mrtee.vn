import { Global, Module } from '@nestjs/common';
import { EnvironmentService } from './environment';

@Global()
@Module({
  providers: [EnvironmentService],
  exports: [EnvironmentService],
})
export class ConfigModule {}
