import { Module } from "@nestjs/common";
import { AdminController } from "./admin/admin.controller.ts";
import { CampaignController } from "./campaign/campaign.controller.ts";
import { JournalController } from "./journal/journal.controller.ts";
import { LibraryController } from "./library/library.controller.ts";
import { TableGateway } from "./table/table.gateway.ts";

@Module({
  controllers: [AdminController, CampaignController, JournalController, LibraryController],
  providers: [TableGateway],
})
export class AppModule {}
