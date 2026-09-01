import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { DiscordModule } from './modules/discord/discord.module';

@Module({
  imports: [AppConfigModule, DatabaseModule, DiscordModule],
})
export class AppModule {}
