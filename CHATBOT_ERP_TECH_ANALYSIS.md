# BÁO CÁO PHÂN TÍCH: BỔ SUNG CHATBOT CHO ERP QUẢN LÝ SẢN XUẤT

> Ngày: 2026-09-30 · Nhánh: `feat/ai-chat-integration`
> Phạm vi: xác định chức năng chatbot cần có, đánh giá hiện trạng (Langflow + `ai-assistant`), và đề xuất công nghệ phù hợp.

---

## 1. TÓM TẮT (TL;DR)

| Câu hỏi | Kết luận |
| :--- | :--- |
| Chatbot nên làm gì trước? | **Hỏi–đáp số liệu thời gian thực, chỉ đọc** (tiến độ job, trễ hạn, tồn kho, PO, QC/NCR, giao hàng). Chưa cho ghi/duyệt. |
| Kiến trúc nên là gì? | **Tool-calling agent chạy ngay trong NestJS**, dùng lại các service/report sẵn có. Không cần dựng hệ thống thứ 2. |
| Langflow có nên giữ không? | **Nên dùng như bản prototype/PoC, không nên đưa lên production.** Lý do ở mục 4. |
| Công nghệ đề xuất | **Vercel AI SDK (TypeScript) + 1 LLM tool-calling (Claude/Gemini/OpenAI) + Postgres (bảng hội thoại) + SSE streaming.** RAG (pgvector) để giai đoạn sau. |
| Việc cần sửa gấp | **Các endpoint `/ai-assistant/tools/*` đang public, không cần đăng nhập** (mục 3.2). |

---

## 2. HIỆN TRẠNG DỰ ÁN

### 2.1. Stack backend
NestJS 11 · Drizzle ORM · PostgreSQL · Redis + BullMQ (đã có) · Swagger · JWT + `PermissionsGuard` toàn cục (`APP_GUARD`).
47 module nghiệp vụ; luồng: Bán hàng → BOM/Routing → Lệnh SX/Job → Mua hàng → Kho → Gia công ngoài → IQC/OQC → Xuất hàng.
Chưa có `pgvector`, chưa có thư viện AI nào trong `package.json`.

### 2.2. Phần chatbot đã làm (chưa commit)
- [src/api/ai-assistant/](src/api/ai-assistant/): 11 endpoint tool `GET /ai-assistant/tools/*` (factory-alerts, delayed-jobs, track-job/:code, pending-po, stock, upcoming-deliveries, bottlenecks…), tái sử dụng `ReportsService`.
- [docker-compose.langflow.yml](docker-compose.langflow.yml) + [langflow_erp_agent_flow.json](langflow_erp_agent_flow.json): Langflow gọi các endpoint trên, luồng 2 LLM (Router rẻ → Analyst mạnh).
- 2 tài liệu thiết kế: `CHATBOT_ERP_LANGFLOW_ARCHITECTURE.md`, `CHATBOT_ERP_TOOL_CALLING_PLAN.md`.

**Đánh giá:** lớp *tool API* (phần NestJS) là tài sản tốt và **giữ lại được cho mọi phương án**. Phần cần cân nhắc lại là lớp *orchestration* (Langflow).

---

## 3. VẤN ĐỀ PHÁT HIỆN TRONG HIỆN TRẠNG

### 3.1. Kỹ thuật/kiến trúc
1. **Hai hệ thống phải vận hành**: NestJS + Langflow (Python, SQLite riêng, proxy Python riêng). Thêm 1 điểm hỏng, 1 nơi deploy, 1 nơi lưu credential.
2. **Chuỗi 2 LLM cố định** (Router → Analyst) tăng độ trễ và chi phí cho câu hỏi đơn giản; agent tool-calling đơn cho kết quả tương đương với 1 lượt gọi ở đa số câu hỏi.
3. **Logic hội thoại nằm ngoài code repo** (file JSON flow) → khó review, test, versioning, CI.
4. Tài liệu có các con số chưa được đo ("tiết kiệm 80% token", "độ chính xác 100%", "latency < 1s") — nên coi là giả định, cần benchmark thực.
5. Cấu hình còn hard-code: `BACKEND_HOST=172.27.229.203` (IP WSL), tên model cũ (`claude-3-5-sonnet`, `gemini-flash-1.5`).
6. `trackJobOrOrder` trả `as any` cho nhánh PO/DO → mất type-safety cho DTO.

### 3.2. Bảo mật (ưu tiên cao)
| # | Vấn đề | Vị trí | Mức |
| :-: | :--- | :--- | :-: |
| 1 | Controller gắn `@Public()` → JWT guard bỏ qua; `@Permissions('reports:read')` cũng vô hiệu vì user không xác định. **Bất kỳ ai gọi được API đều đọc được dữ liệu sản xuất/mua hàng/tồn kho.** | [ai-assistant.controller.ts](src/api/ai-assistant/ai-assistant.controller.ts) | Cao |
| 2 | `AiAssistantAuthGuard` **chưa được gắn vào đâu**; và nếu gắn, chỉ kiểm tra chuỗi bắt đầu bằng `Bearer ` chứ **không verify JWT**. | [ai-assistant-auth.guard.ts](src/api/ai-assistant/guards/ai-assistant-auth.guard.ts) | Cao |
| 3 | API key mặc định hard-code `erp-langflow-secret-key-2026`, so sánh chuỗi thường (không constant-time). | cùng file | Trung bình |
| 4 | `LANGFLOW_SECRET_KEY` commit trong compose; `AUTO_LOGIN=true`, `CORS ["*"]`, `SSRF_PROTECTION_ENABLED=false`, port 7860 publish ra host. | [docker-compose.langflow.yml](docker-compose.langflow.yml) | Cao nếu expose ra mạng |
| 5 | Chatbot dùng **quyền của chính nó**, không mang danh tính người hỏi → không thể phân quyền theo vai trò (QC chỉ xem QC, kho chỉ xem kho…). | thiết kế | Trung bình |
| 6 | Chưa có audit log ai hỏi gì/tool nào trả gì (chỉ `logger.log`). | service | Trung bình |
| 7 | Dữ liệu ERP (giá mua, khách hàng, NCC) gửi thẳng tới LLM cloud — cần chính sách dữ liệu. | thiết kế | Cần quyết định |

---

## 4. PHÂN TÍCH NHU CẦU CHỨC NĂNG

### 4.1. Nhóm chức năng theo mức độ rủi ro/giá trị

| Cấp | Nhóm | Ví dụ câu hỏi | Rủi ro | Khuyến nghị |
| :-: | :--- | :--- | :-: | :--- |
| **L1** | Tra cứu số liệu (read-only) | "JOB0010 đến đâu rồi?", "Tồn kho thép SS400?", "PO nào trễ?", "Tuần này giao gì?" | Thấp | **Làm ngay** — phần lớn đã có endpoint |
| **L2** | Phân tích/tóm tắt | "Vì sao trễ?", "So với hôm qua?", "Tóm tắt tình hình xưởng cho họp sáng" | Thấp–TB | Làm cùng L1 (LLM đọc kết quả tool, tính toán bằng code chứ không để LLM tự cộng trừ) |
| **L3** | Cảnh báo chủ động | Đẩy tóm tắt trễ hạn/NCR mỗi sáng qua chat/Zalo/email | Thấp | Dùng BullMQ + cron có sẵn; không cần LLM để phát hiện, chỉ để diễn giải |
| **L4** | Hỏi tài liệu (RAG) | "Quy trình IQC cho phôi thép?", "Dung sai bản vẽ X?" | TB (sai nguồn) | Giai đoạn sau, cần có tài liệu SOP đã số hóa |
| **L5** | Thao tác ghi | "Tạo PR cho vật tư còn thiếu", "Xác nhận PO" | **Cao** | Chỉ làm khi L1–L3 ổn; luôn có bước **xác nhận của người dùng**, đi qua service/permission hiện có |
| **L6** | Text-to-SQL tự do | "Cho tôi top 10 khách hàng theo doanh số quý" | Cao | **Không khuyến nghị** làm mặc định (xem 5.4) |

### 4.2. Bộ tool còn thiếu so với nhu cầu ERP
Đã có: alerts, delayed jobs, OS delayed, QC, NCR, track job, PO chờ, tồn kho, giao hàng, bottleneck.
Nên bổ sung theo thứ tự: (1) **tra cứu đơn bán hàng theo khách/mã** (`orders`), (2) **thiếu vật tư cho job** (BOM vs `inventory_balances`), (3) **trạng thái PR/báo giá/PO** (đã có domain purchase), (4) **thanh toán/đề nghị chi** (`payment-requests`), (5) **so sánh kỳ** (tính bằng code, trả sẵn delta).

### 4.3. Yêu cầu phi chức năng
| Yêu cầu | Mục tiêu đề xuất |
| :--- | :--- |
| Phân quyền | Mọi tool chạy **với danh tính người hỏi**; tái sử dụng `PermissionsGuard`/role hiện có |
| Độ chính xác số liệu | LLM **không tự tính**; tool trả số đã tổng hợp; câu trả lời phải trích nguồn (mã job/PO) |
| Độ trễ | Câu đơn giản < 5s tới token đầu tiên phản hồi cuối; dùng streaming để cảm nhận nhanh |
| Chi phí | Đặt trần token/người dùng/ngày; cache kết quả tool 30–60s (Redis có sẵn) |
| Kiểm toán | Lưu: user, câu hỏi, tool đã gọi + tham số, thời gian, token, phản hồi |
| Ngôn ngữ | Tiếng Việt (thuật ngữ cơ khí: tiện, phay, chấn, NCR, IQC/OQC) |
| Dữ liệu nhạy cảm | Quyết định trước: cloud LLM hay on-premise (mục 6) |

---

## 5. SO SÁNH PHƯƠNG ÁN CÔNG NGHỆ

### 5.1. Lớp Orchestration (điều phối LLM + tool)

| Tiêu chí | A. Langflow (hiện tại) | B. Dify / Flowise (low-code khác) | **C. Vercel AI SDK trong NestJS** | D. LangChain.js / LangGraph | E. Anthropic/OpenAI SDK thuần |
| :--- | :-: | :-: | :-: | :-: | :-: |
| Thêm hạ tầng | Python + SQLite riêng | Nhiều container (DB, Redis, worker) | **Không** | Không | Không |
| Ngôn ngữ trùng stack | Không (Python) | Không | **TS** | TS | TS |
| Dùng lại service/guard/DTO sẵn có | Qua HTTP proxy | Qua HTTP | **Gọi thẳng service** | Gọi thẳng | Gọi thẳng |
| Danh tính người dùng/phân quyền | Khó (phải chuyển token qua flow) | Khó | **Tự nhiên** (request context) | Tự nhiên | Tự nhiên |
| Test tự động / CI / code review | Yếu (flow JSON) | Yếu | **Tốt** | Tốt | Tốt |
| Streaming tới frontend | Phải qua API Langflow | Có | **Có sẵn (SSE / data stream)** | Có | Tự viết |
| Đổi LLM provider | Dễ (UI) | Dễ | **Dễ (1 dòng)** | Dễ | Khóa vào 1 provider |
| Tốc độ dựng prototype | **Rất nhanh** | Nhanh | Trung bình | Chậm hơn | Trung bình |
| Độ phức tạp/độ phình | Trung bình | Cao | **Thấp** | Cao (nhiều abstraction) | Thấp |
| Phù hợp production nhỏ–vừa | ⚠️ | ⚠️ | ✅ | ⚠️ (chỉ khi cần đồ thị nhiều bước) | ✅ |

**Đề xuất: phương án C.** Lý do chính: hệ thống đã là NestJS/TypeScript với guard, permission, DTO và service sẵn; agent chỉ cần ~10–20 tool là hàm gọi service; đường trực tiếp giữ được **danh tính + quyền** và test được. Langflow giữ vai trò công cụ thử prompt/flow nhanh, không phải runtime.
LangGraph chỉ đáng cân nhắc nếu sau này có quy trình nhiều bước có phê duyệt/nhánh phức tạp (L5).

### 5.2. Kiến trúc đề xuất

```
[Web ERP (Next.js)]  ──SSE──▶  POST /api/chat  (JwtAuthGuard, user context)
                                   │
                          ┌────────▼─────────┐
                          │ ChatModule       │  system prompt VI + giới hạn nghiệp vụ
                          │  - AI SDK agent  │  streamText + tools (maxSteps ~5)
                          │  - session store │  bảng chat_sessions / chat_messages
                          │  - audit log     │  bảng chat_tool_calls
                          └────────┬─────────┘
             tool = hàm mỏng gọi service có sẵn (kiểm quyền theo user)
   ┌──────────┬───────────┬───────────┬───────────┬───────────┐
   ▼          ▼           ▼           ▼           ▼           ▼
 Reports   Production   Purchase   Inventory   Orders     (RAG: pgvector — sau)
 Service   Jobs         Orders                 Outbound
                       Postgres (read-only)  ·  Redis cache 30–60s
```

Nguyên tắc thiết kế:
1. **Tool = thin wrapper** quanh service hiện có, trả DTO nhỏ gọn (cắt trường thừa để giảm token).
2. **Tool nhận danh tính từ request**, kiểm `permissions` trước khi chạy; không dùng `@Public()`.
3. **Mọi phép tính/so sánh do code làm**, LLM chỉ diễn giải.
4. **Một agent, nhiều tool** (không cần "unified dispatcher" ép 1 tool nhiều `action` — tool có schema riêng, mô tả rõ thì mô hình hiện nay chọn tool tốt; gộp lại còn làm mất kiểm tra tham số từng loại).
5. **Hội thoại lưu DB**, chỉ nạp N lượt gần nhất + entity đã nhắc (mã job) — giữ nguyên "quy tắc vàng": không lưu raw dữ liệu ERP làm memory.
6. Giới hạn số bước tool, số dòng trả về, timeout; kết quả rỗng phải trả thông báo rõ (tránh LLM bịa).

### 5.3. Lựa chọn mô hình LLM

| Hướng | Ưu | Nhược | Khi nào chọn |
| :--- | :--- | :--- | :--- |
| **Cloud – 1 model tool-calling tầm trung** (Claude Sonnet/Haiku, Gemini Flash, GPT-mini) | Chất lượng tool-calling và tiếng Việt tốt, không cần hạ tầng GPU, triển khai nhanh | Dữ liệu ra ngoài; chi phí theo lượng dùng | **Mặc định**, nếu ban lãnh đạo chấp nhận chính sách dữ liệu |
| Cloud 2 tầng (rẻ định tuyến + mạnh phân tích) | Có thể tiết kiệm nếu lưu lượng lớn | Thêm độ trễ + độ phức tạp; lợi ích chưa được đo | Chỉ sau khi có số liệu chi phí thực tế |
| On-premise (Ollama: Qwen2.5-32B…) | Dữ liệu không rời nhà máy | Cần GPU; tool-calling & tiếng Việt kém hơn; vận hành nặng | Nếu bắt buộc bảo mật dữ liệu |

Khuyến nghị: bắt đầu **1 model cloud**, viết qua abstraction của AI SDK để đổi provider bằng cấu hình; đo chi phí/độ chính xác 2–4 tuần rồi mới tối ưu (tầng model, cache).
(Tên model cần chốt theo bảng giá/khả dụng tại thời điểm triển khai.)

### 5.4. Vì sao không Text-to-SQL tự do
Schema 100+ bảng, nhiều enum/quy tắc trạng thái, dữ liệu nhạy cảm (giá, công nợ). LLM sinh SQL sai vẫn ra số "trông hợp lý" → **rủi ro quyết định sai** và lộ dữ liệu vượt quyền. Thay vào đó: tool có tham số hẹp (mã, khoảng ngày, trạng thái). Nếu sau này cần phân tích ad-hoc: chỉ dùng **role DB chỉ đọc + view đã duyệt + LIMIT/timeout**, không chạy trên bảng gốc.

### 5.5. RAG (SOP, quy trình, bản vẽ)
- **pgvector** trên chính PostgreSQL hiện có là đủ (không cần Pinecone/Qdrant ở quy mô nhà máy).
- Chỉ bật khi có tài liệu SOP/quy trình QC đã số hóa; trả lời phải kèm trích dẫn tài liệu.
- Tách hẳn với dữ liệu giao dịch: dữ liệu giao dịch luôn lấy qua tool (luôn mới), RAG chỉ cho kiến thức tĩnh.

### 5.6. MCP (Model Context Protocol) — tùy chọn
Nếu muốn dùng các tool này ở nhiều client (Claude Desktop, IDE, agent khác), có thể bọc **cùng bộ tool** thành MCP server. Không cần cho chatbot nhúng trong web; làm sau, không ảnh hưởng thiết kế.

---

## 6. QUYẾT ĐỊNH CẦN NGƯỜI SỞ HỮU SẢN PHẨM CHỐT

1. **Chính sách dữ liệu**: cho phép gửi dữ liệu sản xuất/mua hàng tới LLM cloud? Có che (mask) giá/khách hàng không?
2. **Đối tượng dùng đầu tiên**: quản đốc / kế hoạch / QC / ban giám đốc? (quyết định bộ tool và phân quyền ưu tiên)
3. **Kênh**: khung chat trong web ERP, hay cả Zalo/Telegram? (ảnh hưởng L3 cảnh báo chủ động)
4. **Có cho chatbot ghi dữ liệu (L5) không, và khi nào?**
5. **Ngân sách LLM/tháng** và ngưỡng chấp nhận độ trễ.

---

## 7. LỘ TRÌNH ĐỀ XUẤT

| Giai đoạn | Nội dung | Kết quả kiểm chứng được |
| :-: | :--- | :--- |
| **0. Vá bảo mật (ngay)** | Bỏ `@Public()`; dùng JWT guard + permission thật; xóa key/secret hard-code; không expose Langflow ra ngoài; hoặc tắt tool API khi không dùng | Gọi endpoint không token → 401 |
| **1. Chatbot L1+L2 trong NestJS** | `ChatModule` (AI SDK), chuyển 11 endpoint hiện có thành tool gọi service trực tiếp; bảng phiên/tin nhắn/audit; SSE streaming; giới hạn tốc độ/token | Bộ ~30 câu hỏi mẫu (VI) có đáp án chuẩn, chạy được như test hồi quy |
| **2. Mở rộng tool + UX** | Orders, thiếu vật tư theo BOM, PR/PO/thanh toán; gợi ý câu hỏi tiếp; trích nguồn mã; cache Redis | Tỷ lệ đúng trên bộ câu hỏi ≥ ngưỡng thống nhất |
| **3. Cảnh báo chủ động (L3)** | BullMQ cron tóm tắt buổi sáng, đẩy qua kênh đã chọn | Người dùng nhận bản tóm tắt đúng giờ |
| **4. RAG SOP (L4)** | pgvector, nạp tài liệu, trích dẫn | Câu hỏi quy trình có nguồn đúng |
| **5. Thao tác ghi (L5)** | Tool ghi qua service hiện có + bước xác nhận + audit | Không có ghi nào thiếu xác nhận |

### Việc tái sử dụng từ phần đã làm
- **Giữ**: toàn bộ logic trong `AiAssistantService` (đổi thành tool), các DTO, bộ câu hỏi/kịch bản trong 2 tài liệu (làm test mẫu).
- **Bỏ/đóng băng**: chuỗi 2 LLM cố định, unified dispatcher, proxy Python, container Langflow production (giữ lại làm sandbox thử prompt nếu muốn).

---

## 8. RỦI RO & CÁCH GIẢM

| Rủi ro | Cách giảm |
| :--- | :--- |
| LLM bịa số/mã | Tool trả số sẵn; prompt bắt buộc "chỉ dùng dữ liệu tool"; rỗng → nói "không tìm thấy"; test hồi quy |
| Lộ dữ liệu vượt quyền | Tool chạy theo quyền user; không Text-to-SQL; audit log |
| Prompt injection từ dữ liệu (tên NCC, ghi chú nhập tự do) | Coi dữ liệu tool là *dữ liệu*, không phải chỉ thị; tool chỉ đọc ở giai đoạn đầu; L5 luôn cần xác nhận người dùng |
| Chi phí tăng ngoài kiểm soát | Trần token/user/ngày, cache tool, giới hạn bước & kích thước kết quả |
| Phụ thuộc 1 nhà cung cấp LLM | Dùng lớp abstraction, cấu hình model qua env |
| Câu hỏi ngoài phạm vi | System prompt giới hạn miền ERP; từ chối lịch sự |

---

## 9. KẾT LUẬN

Hướng đi hợp lý nhất cho dự án là **giữ lớp tool API đã có, chuyển lớp điều phối từ Langflow về NestJS bằng Vercel AI SDK**, một agent tool-calling duy nhất, chạy với danh tính và quyền của người dùng, lưu hội thoại + audit trong Postgres, streaming qua SSE. Langflow phù hợp để thử nghiệm nhanh, nhưng đưa vào production sẽ thêm hệ thống thứ hai khó phân quyền, khó test và đang mở nhiều lỗ hổng cấu hình. Việc **đầu tiên** cần làm, độc lập với mọi lựa chọn công nghệ, là khóa lại các endpoint `/ai-assistant/tools/*` đang public.
