# InconsisTable P0: khung repo mới

> Kế hoạch cho giai đoạn P0 của `docs/spikes/universal-rpg-platform.md` (§7). Chờ duyệt trước khi code.
> Repo đích: `The-Inconsistent/InconsisTable` (private). Package scope npm viết thường: `@inconsistable/*`.

## Mục tiêu

Một repo chạy được, chưa có luật chơi nào hoàn chỉnh, nhưng có đủ xương sống để P1 chỉ còn việc thêm 5e SRD:
- Pipeline action với phân quyền mới.
- Đăng nhập Clerk, QR và lời mời.
- Lobby và phòng chơi trống.
- Bảng `actor` trên Postgres 18.
- Engine luật với các primitive 5e cần.

**Xong khi:**
1. `bun run typecheck`, `lint`, `test` xanh trên CI.
2. Test của `can()` phủ toàn bộ ma trận quyền (§3.6), kể cả các trường hợp bị từ chối.
3. Test engine: một manifest mẫu dạng 5e (không chứa chữ của SRD) compile được; derived, xúc xắc, initiative `ranked`
   và HP + death save chạy đúng.
4. Smoke test end-to-end:
   - GM tạo phòng, mời người chơi bằng room QR, người chơi vào bằng tài khoản và bằng guest token.
   - Màn hình TV vào bằng token `screen`.
   - Chủ phòng chuyển quyền, người nhận chấp nhận.
   - `gm` không gỡ được chủ phòng.

## Nguyên tắc chép code

Chép những gì đã trung lập và đã chạy thật ở auspex_gm, đổi tên `@wg/*` thành `@inconsistable/*`, bỏ mọi thứ W&G.
Không chép lịch sử git. Không chép `packages/data`, `books/`, ảnh portrait hay bất kỳ nội dung sách nào.

| Từ auspex_gm | Vào InconsisTable | Thay đổi |
|---|---|---|
| root: `package.json`, `turbo.json`, `tsconfig.json`, `eslint.config.mjs`, Prettier, `.husky/pre-commit` | giữ cấu trúc | Bun, Turborepo, TypeScript 5.9 như cũ; tên package mới |
| `packages/auth` | `packages/auth` (`@inconsistable/auth`) | Giữ nguyên cách bọc Clerk; thêm role `moderator` trong `type.d.ts`; thêm xử lý webhook `user.updated` |
| `apps/api/src/core/` (`db.ts`, `errors.ts`, `sql.ts`, `rate-limit.ts`, `http.ts`) | như cũ | `db.ts` trỏ Postgres 18; id mặc định `uuidv7()` |
| `apps/api/src/table/` (`table.gateway.ts`, `table.dispatch.ts`, `table.state.ts`) | như cũ | `authorize` = state guard + `can()` + validator; `state_version` trên mọi broadcast; view theo `characterIds` |
| `apps/api/src/auth/` | như cũ | `membership.role` bỏ `owner`; thêm `membership_character`, `access_token.role` (`player`/`screen`), `ownership_transfer` |
| `apps/api/src/campaign/` (phần lobby, tạo, archive, xoá, session) | như cũ | Bỏ `tier`, `glory`, `ruin`, framework; thêm `owner_user_id`, `ruleset_version_id` |
| `apps/api/src/codex/` | như cũ | Chỉ cấu trúc; thêm bảng cha `codex_entry` + `codex_reveal`; codex ghi theo patch |
| `apps/api/src/admin/` | như cũ | Giữ `ADMIN_ACTIONS` và OPEN AS ADMIN |
| `apps/api/test/smoke.test.ts` | như cũ | Viết lại cho các luồng ở mục "Xong khi" |
| Relay trang sách: sự kiện `book:*` ở gateway, `books-provider` ở web; dựng thẻ in trong trình duyệt (`print-dialog`, `components/print`, chỉ phần khung) | như cũ | Không gắn với sách W&G: GM chọn PDF trên máy mình, map theo `sources[]` của ruleset |
| `apps/web`: `proxy.ts`, `server-api.ts`, `layout.tsx`, `hooks/use-table`, `lib/share-origin`, `lib/qr`, lobby, invite, `join/[token]`, `c/[campaignId]` | như cũ | App GM và người chơi chỉ có khung tab, chưa có sheet |
| `apps/web/components/ui`: `bar`, `confirm-action`, `field-error`, `number-input`, `refusal`, `record-list`, `theme-toggle`, `codex-search`, `mentions`, `mention-field` | như cũ | Bỏ các component gắn W&G (`corruption-test`, `threat-*`, `stat-block` kiểu W&G…) |
| `docker-compose.yml` | như cũ | `postgres:18.x`, cổng dev riêng |

Theme "Imperial Manuscript" **không** chép làm mặc định. P0 dùng một theme trung tính; theme theo World làm ở P2.

## Phần viết mới

**`packages/core-schema`**
- `Ctx` với `seat { kind: member | token | admin, role, scopes, characterIds }`, `campaignOwnerId`, `userId`.
- `Permission` (`z.enum`), `SEAT_GRANTS`, `OWN_GRANTS`, `COGM_SCOPES_FOR`, `OWNER_ONLY`.
- `canInCampaign({ ctx, perm, target })` và các quy tắc theo người bị tác động: chỉ gỡ ghế thấp hơn mình; chủ phòng
  chỉ chuyển, không bị gỡ.
- Union `Action` của core: `campaign.*`, `session.*`, `invite.*`, `member.*` (có `member.appoint`), `token.*`,
  `screen.*`, `codex.*`.
- Hình dạng `LiveState` và `Codex` tối thiểu.

**`packages/rules-engine`**
- Manifest zod: các phần P1 cần (`entities`, `resources`, `conditions`, `tests`, `initiative`, `health`, `layout`).
  Mọi entry luật có `cite`. Visibility mặc định `gm`.
- Biểu thức: chốt thư viện CEL (`@marcbachmann/cel-js`) sau khi kiểm tra license và phiên bản lúc bắt đầu P0. Phương án
  dự phòng là tự viết parser Pratt.
  - Compile khi load.
  - Sắp topo đồ thị derived.
  - Whitelist hàm.
  - Giới hạn số node AST và kích thước manifest.
- Xúc xắc:
  - Ngữ pháp `NdX`, `kh/kl`, `!`, `>=T`.
  - Giới hạn N ≤ 100, X ≤ 1000, độ sâu nổ ≤ 10; từ chối `!` trên d1.
  - Gieo ở server.
- Primitive: `dice.sumVsTarget`, `initiative.ranked`, `health.tracks` (HP, HP tạm, death save), `resource` có trần
  (slot phép).
- Mỗi op khai báo `perm`, `targets`, `validate`, `apply`, `touches`.
- `toViewerView`: tầng visibility, cộng chỗ móc cho hàm view của ruleset.
- Không có script sandbox ở P0.

**Database (Postgres 18)**
- `actor` có `kind` (`pc`, `companion`, `npc`, `creature`, `group`, `vehicle`, `hazard`) và `entity_type`.
- `actor_field`, `actor_resource`, `actor_condition`, `actor_choice`, `actor_link`.
- `resource_pool`, `ruleset`, `ruleset_version`.
- `session_event`: log để undo; ghi `before`/`after` bằng `RETURNING OLD/NEW`.
- Migration Drizzle tạo từ đầu, không cần tương thích dữ liệu cũ.

**`CLAUDE.md` và `docs/` của repo mới**
- Viết lại từ auspex_gm và chép nguyên 8 quy tắc "Tinh thần mang từ Auspex" (`universal-rpg-platform.md`, đầu tài
  liệu) thành quy tắc bắt buộc. Tóm tắt các quy tắc đó:
  - luật cite trang in, không từ trí nhớ;
  - quyết định mơ hồ ghi vào file "house decisions";
  - không chép nguyên văn sách;
  - PDF không lên server, trang sách chỉ relay;
  - nội dung chỉ đến ghế;
  - xúc xắc thật;
  - server quyết định;
  - `ponytail:`.
- Review checklist (`.claude/code-review.md`) và lệnh `/review` chép sang. Các mục "block merge" về sách và luật giữ
  nguyên.
- Thêm chính sách JSONB (§5.4) và bảng "mỗi thay đổi đi đường nào" (§5.3).

**CI (GitHub Actions)**
- Chạy typecheck, lint, test.
- Smoke test cần Postgres 18 và `CLERK_TEST_SECRET` như auspex_gm.
- Chưa có deploy ở P0.

## Thứ tự làm

1. Khung repo: workspace, Turborepo, TS, ESLint, Prettier, Husky, CI, `CLAUDE.md`.
2. `packages/auth` và `packages/core-schema` (`can()` + test ma trận quyền).
3. `apps/api`:
   - core và database (Postgres 18, migration);
   - auth, campaign và gateway với `authorize` mới.
4. `packages/rules-engine` + manifest mẫu dạng 5e + test.
5. `apps/web`: lobby, tạo phòng, PARTY (QR, mời, chuyển chủ phòng), khung app GM và người chơi, màn hình TV.
6. Smoke test end-to-end, sửa cho xanh.

Bước 4 độc lập với bước 3 và 5, nên chạy song song được.

## Cần làm trước khi bắt đầu

- **Repo:** tạo `The-Inconsistent/InconsisTable` (private) và cài Claude GitHub App cho repo đó.
- **Clerk:** một application mới cho InconsisTable, chế độ **Invite-only**. Session-token claims như auspex_gm
  (`docs/development.md` §Clerk). Cần key dev.
- **Postgres 18 cho dev:** chạy bằng Docker, không cần gì thêm. Instance prod chỉ cần từ P1 trở đi.
