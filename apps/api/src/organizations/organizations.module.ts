import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { AdminOrganizationsController } from './admin-organizations.controller';
import { AuthModule } from '../auth/auth.module';
import { StudentImportController } from './student-import.controller';
import { StudentImportService } from './student-import.service';

@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController, AdminOrganizationsController, StudentImportController],
  providers: [StudentImportService],
})
export class OrganizationsModule {}
