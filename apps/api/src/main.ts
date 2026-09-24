import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.ts";
import { runMigrations } from "./core/db.ts";

await runMigrations();
const app = await NestFactory.create(AppModule);
app.setGlobalPrefix("api");
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT ?? 4000));
