# TÀI LIỆU THIẾT KẾ KIẾN TRÚC CHATBOT ERP SẢN XUẤT (LANGFLOW + NESTJS)
> **Phiên bản:** 2.0 (Enterprise Edition)  
> **Nền tảng:** Langflow + NestJS + PostgreSQL + Drizzle ORM  
> **Mục tiêu:** Xử lý thông minh | Tối ưu Memory | Phân tầng Model Rẻ vs Mạnh | Tích hợp API ERP thời gian thực | Báo cáo điều hành chuyên sâu

---

## 1. TỔNG QUAN KIẾN TRÚC & ĐỐI CHIẾU VỚI SƠ ĐỒ DIFY

Hệ thống được chuyển đổi toàn diện từ mô hình Dify Chatflow sang **Langflow**, kế thừa 100% các nguyên tắc cốt lõi:

```
[1. Chat Input] ──> [2. Load Memory] ──> [3. LLM 1: Intent & Entity] ──> [4. Resolve Context]
                                                                                  │
[11. Chat Output] <── [10. Update Memory] <── [9. LLM 2: Phân tích] <── [6. Router & 7. API ERP]
```

### Bảng đối chiếu 1:1 các khối chức năng

| STT | Khối chức năng (Sơ đồ Dify) | Thành phần tương đương trong Langflow | Vai trò & Cơ chế xử lý |
| :-: | :--- | :--- | :--- |
| **1** | **Chat Input** | **Node `ChatInput`** | Nhận `user_input` từ người dùng, quản lý `session_id`. |
| **2** | **Load Memory** | **Session Memory Loader** | Đọc ngữ cảnh ngắn hạn (`n_messages: 50`), nạp thực thể của lượt trước (`last_job_code`, `last_metric`). |
| **3** | **LLM – Intent & Entity** | **LLM 1 (`IntentRouterAgent`)** | Nhận diện ý định, trích xuất thực thể ra JSON (`intent`, `line`, `job_code`, `date_range`). |
| **4** | **Resolve Context** | **Context Resolver Engine** | Xử lý từ ngữ phụ thuộc ngữ cảnh: `"hôm nay"`, `"hôm qua"`, `"nó"`, `"so với hôm qua"`, `"tại sao giảm"`. |
| **5** | **Permission Check** | **`AiAssistantAuthGuard` (RBAC)** | Kiểm tra vai trò (Quản đốc, Kế hoạch, QC) và Tenant bằng Code, không tốn token LLM. |
| **6** | **Router (Condition)** | **Conditional Tool Dispatcher** | Phân nhánh chính xác yêu cầu sang nhóm công cụ tương ứng. |
| **7** | **Gọi API ERP (NestJS)** | **`ERPFactoryToolsComponent`** | Kết nối trực tiếp vào 7+ endpoint API nội bộ nhà máy (`http://localhost:8000`). |
| **8** | **Xử lý & Tổng hợp dữ liệu** | **Data Aggregator & Resilient Handler** | Làm sạch JSON, bắt lỗi mềm (Job không tìm thấy trả về JSON thông báo thân thiện, không ném 404). |
| **9** | **LLM – Phân tích & Trả lời** | **LLM 2 (`ExecutiveAnalystAgent`)** | Đọc số liệu thực tế, tìm nguyên nhân nghẽn chuyền (Downtime/Lỗi), xuất báo cáo 3 phần. |
| **10** | **Update Memory** | **Session State Updater** | Lưu lại thực thể vừa tra cứu vào Session Memory để phục vụ các câu hỏi nối tiếp. |
| **11** | **Trả về người dùng** | **Node `ChatOutput`** | Định dạng Markdown bảng biểu, bullet point, kèm **gợi ý 2-3 câu hỏi tiếp theo**. |
| **12** | **Tối ưu Memory** | **Memory Truncation Policy** | **Quy tắc vàng:** Tuyệt đối không lưu raw ERP data vào memory để chống phình token và ảo giác. |

---

## 2. CHIẾN LƯỢC PHÂN TẦNG MODEL (MODEL TIERING STRATEGY)

Việc chia tách rõ ràng **chỗ nào dùng Model Rẻ / Nhanh** và **chỗ nào dùng Model Mạnh / Suy luận** giúp hệ thống:
- **Tiết kiệm 75% - 85% chi phí API hàng tháng**.
- **Độ trễ cảm nhận (perceived latency) giảm từ 4s xuống dưới 1s**.
- **Không xảy ra tình trạng "bịa số liệu" khi phân tích các báo cáo sản xuất phức tạp**.

```
[Người dùng hỏi] 
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 🟢 TẦNG 1: MODEL RẺ / NHẸ (Fast & Structured)          │
│ • Nhiệm vụ: Phân loại Intent, trích xuất Entity ra JSON│
│ • Độ trễ: 0.2s - 0.4s | Chi phí: ~$0.14 / 1M tokens   │
└────────────────────────────────────────────────────────┘
       │
       ▼ (Chuyển sang Router & gọi Tool API ERP bằng CODE thuần)
       │
┌────────────────────────────────────────────────────────┐
│ ⚪ CODE THUẦN (Zero Token - Miễn phí)                  │
│ • Nhiệm vụ: Check quyền RBAC, gọi HTTP NestJS, lọc JSON│
└────────────────────────────────────────────────────────┘
       │
       ▼ (Dữ liệu ERP thực tế đã được làm sạch)
       │
┌────────────────────────────────────────────────────────┐
│ 🔴 TẦNG 2: MODEL MẠNH (Reasoning / High-IQ)            │
│ • Nhiệm vụ: Phân tích số liệu, tìm nguyên nhân nghẽn,  │
│   đánh giá Downtime, lập báo cáo điều hành 3 phần      │
│ • Năng lực: Chain-of-Thought, không ảo giác số liệu    │
└────────────────────────────────────────────────────────┘
```

### Bảng cấu hình chi tiết theo từng môi trường triển khai

| Vị trí / Node | Nhiệm vụ | Yêu cầu kỹ thuật | Lựa chọn Cloud (OpenRouter API) | Lựa chọn On-Premise (Ollama Offline) |
| :--- | :--- | :--- | :--- | :--- |
| **Node 2 & 10: Memory Summarizer** | Nén 5-10 lượt chat cũ thành 2 câu tóm tắt. | Tốc độ cực nhanh, tác vụ đơn giản. | `deepseek/deepseek-chat`<br>`google/gemini-flash-1.5` | `qwen2.5:3b`<br>`llama3.2:3b` |
| **Node 3 & 4: LLM 1 (Intent & Entity Router)** | Phân loại 3 nhóm câu hỏi, trích xuất mã Job/Order, resolve từ ngữ phụ thuộc ngữ cảnh (*"hôm nay"*, *"so với hôm qua"*). | Tuân thủ định dạng JSON nghiêm ngặt, độ trễ cực thấp. | `deepseek/deepseek-chat`<br>`openai/gpt-4o-mini`<br>`google/gemini-2.0-flash` | `qwen2.5:7b-instruct`<br>`mistral:7b` |
| **Node 5: Permission & RBAC Check** | Kiểm tra quyền vai trò người dùng (Quản đốc, QC, Kế hoạch). | Bảo mật tuyệt đối, thực thi bằng logic code, **không dùng LLM**. | **Code TypeScript (NestJS Guard)** | **Code TypeScript (NestJS Guard)** |
| **Node 7 & 8: Data Fetcher & Aggregator** | Gọi HTTP API và cắt gọt JSON database. | Tốc độ cao, không tốn token, **không dùng LLM**. | **Code Python / Axios / cURL** | **Code Python / Axios / cURL** |
| **Node 9: LLM 2 (Executive Analyst - Điều hành)** | Đọc bảng công đoạn, so sánh tỷ lệ %, tìm nguyên nhân dừng chuyền / tỷ lệ lỗi, đề xuất giải pháp Kaizen. | Cần suy luận logic nhiều bước (Multi-step Reasoning), hiểu nghiệp vụ xưởng cơ khí, văn phong điều hành sắc bén. | `deepseek/deepseek-r1`<br>`deepseek/deepseek-v3`<br>`anthropic/claude-3-5-sonnet` | `qwen2.5:32b-instruct`<br>`deepseek-r1:14b` / `32b` |

---

## 3. CHIẾN LƯỢC QUẢN LÝ MEMORY 3 TẦNG & TỐI ƯU TOKEN

### 3.1. Phân loại 3 tầng Memory

```
┌────────────────────────────────────────────────────────┐
│ 1. Short-term Memory (Langflow Session State)          │
│ • Lưu session_id, last_job_code, last_line, last_date  │
│ • Vòng đời: 1 phiên làm việc (TTL 1h - 24h)           │
├────────────────────────────────────────────────────────┤
│ 2. Conversation Summary (Ngữ cảnh tóm tắt)             │
│ • Chỉ giữ tóm tắt 3-5 lượt trao đổi gần nhất           │
│ • Tiết kiệm 80% token so với việc nhồi toàn bộ history │
├────────────────────────────────────────────────────────┤
│ 3. Long-term Knowledge Base (RAG / SOP - Tùy chọn)    │
│ • Sổ tay hướng dẫn vận hành máy, quy trình QC 5S       │
│ • Chỉ kích hoạt khi người dùng hỏi nghiệp vụ kỹ thuật │
└────────────────────────────────────────────────────────┘
```

### 3.2. Quy tắc vàng về Memory trong ERP:
1. **Tuyệt đối không lưu raw JSON ERP vào Memory:**
   - Dữ liệu sản xuất thay đổi từng phút (Job từ IN_PROGRESS sang COMPLETED, số lượng tăng lên).
   - Nếu lưu JSON vào Memory, các câu hỏi ở lượt sau sẽ bị mô hình trả lời dựa trên số liệu cũ trong quá khứ.
   - Mỗi câu hỏi mới đều gọi API ERP tươi mới 100%.
2. **Chỉ lưu Context thực thể (Entity Context):**
   - Lượt 1: Người dùng hỏi *"Tiến độ Job JOB0010"* $\rightarrow$ Memory ghi nhận `current_job = "JOB0010"`.
   - Lượt 2: Người dùng hỏi *"Nó đang ở công đoạn nào?"* $\rightarrow$ LLM 1 đọc Memory thấy `current_job = "JOB0010"` và tự động chuyển thành câu hỏi hoàn chỉnh *"Tiến độ công đoạn của JOB0010"*.

---

## 4. KỊCH BẢN HỘI THOẠI THỰC TẾ & XỬ LÝ CONTEXT RESOLUTION

### Kịch bản minh họa (Đúng chuẩn sơ đồ Dify):

```text
[Lượt 1: Khởi tạo tra cứu]
👤 Người dùng: "Kiểm tra tiến độ Job JOB0010"
⚙️  LLM 1 (Rẻ/Nhanh): 
    - Intent: ERP_REALTIME_DATA
    - Action: track_job
    - Code: JOB0010
⚙️  Tool API: GET /api/ai-assistant/tools/track-job/JOB0010 (Trả về JSON 16 công đoạn)
🤖 LLM 2 (Mạnh/Chuyên sâu):
    📊 [Phần 1: Thực trạng số liệu]: Job JOB0010 (DT2 BOBBIN DRIVE PART ASS'Y), 
       mới hoàn thành 6% (1/16 công đoạn). Hạn giao: 24/09/2026 (ĐÃ TRỄ HẠN).
    🔍 [Phần 2: Điểm nghẽn]: Công đoạn TIỆN CNC đang ứ đọng lớn, thời gian hoàn thành = null.
    💡 [Phần 3: Đề xuất hành động]: Điều phối thêm thợ tiện ca đêm, chia nhỏ lô phôi.
    ❓ Gợi ý: Bạn có muốn xem danh sách các Job trễ khác hoặc kiểm tra đơn gia công ngoài không?

[Lượt 2: Câu hỏi nối tiếp - Resolve Context]
👤 Người dùng: "Nó đang ở công đoạn nào?"
⚙️  LLM 1 (Rẻ/Nhanh):
    - Đọc Memory thấy lượt trước nói về JOB0010.
    - Resolve: "Nó" = JOB0010.
    - Chuẩn hóa: "Kiểm tra công đoạn hiện tại của JOB0010".
🤖 LLM 2 (Mạnh/Chuyên sâu):
    Hiện JOB0010 đang dừng ở công đoạn [TIỆN CNC]. Công đoạn chấn phía trước đã hoàn tất (1 chiếc), 
    còn các bước tiện tinh và xử lý nhiệt phía sau chưa thể khởi động.

[Lượt 3: Câu hỏi tìm nguyên nhân - Root Cause Analysis]
👤 Người dùng: "Tại sao lại trễ hạn?"
⚙️  LLM 1 (Rẻ/Nhanh):
    - Resolve: Hỏi nguyên nhân trễ của JOB0010.
🤖 LLM 2 (Mạnh/Chuyên sâu):
    Nguyên nhân trễ hạn chính:
    1. Kế hoạch giao hàng là ngày 24/09/2026 nhưng đến nay mới đạt 6%.
    2. Điểm nghẽn nghiêm trọng tại cụm Tiện CNC (công đoạn 0) chiếm thời gian chờ quá lâu.
    3. Chưa có sự phối hợp đẩy nhanh các chi tiết giao gia công ngoài để lắp ráp đồng bộ.
```

---

## 5. BẢNG PHÂN LOẠI 12 DẠNG CÂU HỎI HỆ THỐNG ĐÁP ỨNG

| Nhóm | Dạng câu hỏi | Endpoint API tương ứng |
| :-: | :--- | :--- |
| **1** | Báo cáo sản xuất tổng thể | `GET /api/reports/production-progress` |
| **2** | Năng suất theo ca / ngày | `GET /api/reports/production-progress` |
| **3** | So sánh kỳ trước (hôm nay vs hôm qua) | Gọi 2 mốc date và LLM 2 thực hiện tính % delta |
| **4** | Tiến độ kế hoạch Job / Order | `GET /api/ai-assistant/tools/track-job/:code` |
| **5** | Tồn kho / Bán thành phẩm WIP | `GET /api/inventory` |
| **6** | Đơn đặt hàng (Sales Order) | `GET /api/orders` |
| **7** | Mua hàng & Vật tư (PO) | `GET /api/purchase-orders` |
| **8** | Chất lượng (Tỷ lệ IQC / OQC) | `GET /api/reports/qc-pass-rate` |
| **9** | Sự cố & Lỗi không phù hợp (NCR) | `GET /api/reports/open-ncr` |
| **10** | Rủi ro & Cảnh báo nóng nhà máy | `GET /api/reports/alerts` & `GET /api/reports/job-due-date` |
| **11** | Đơn gia công ngoài trễ hạn | `GET /api/reports/outsourcing-order-due-date` |
| **12** | Hỏi tự nhiên / Follow-up / Tư vấn Lean | LLM 1 resolve context + LLM 2 tư vấn Kaizen/5S |

---

## 6. HƯỚNG DẪN VẬN HÀNH & KIỂM THỬ

### 6.1. Khởi động hệ thống
1. **NestJS Backend**: Chạy trên cổng `8000` (đã mở `@Public()` cho AI Assistant Tools).
2. **Langflow Container**: Chạy trên cổng `7860` với dữ liệu lưu bền vững tại `./langflow_data`.
3. **Mạng nội bộ**: Proxy container điều hướng `http://localhost:8000` trực tiếp vào backend NestJS.

### 6.2. Kiểm tra nhanh API qua cURL
```bash
# 1. Cảnh báo nóng xưởng
curl -s http://localhost:8000/api/ai-assistant/tools/factory-alerts

# 2. Danh sách Job trễ hạn
curl -s http://localhost:8000/api/ai-assistant/tools/delayed-jobs

# 3. Tra cứu chi tiết tiến độ Job JOB0010
curl -s http://localhost:8000/api/ai-assistant/tools/track-job/JOB0010
```

### 6.3. Trải nghiệm trên Langflow UI
1. Truy cập: **`http://localhost:7860`**.
2. Chọn flow: **`ERP Production Operations AI Agent (Enterprise) (1)`**.
3. Bấm **Playground** và nhập thử:
   - *"Hôm nay xưởng có gì cần xử lý gấp không?"*
   - *"Kiểm tra Job JOB0010"*
   - *"Nó đang ở công đoạn nào?"*
   - *"Tại sao lại trễ hạn?"*
