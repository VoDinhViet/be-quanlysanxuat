# Security Rules

- Do not trust calculated values from clients.
- Calculate totals, VAT, stock changes, defective quantity, and purchase quantity on the server.
- Do not pass raw SQL, raw table names, or raw column names from clients.
- Whitelist dynamic sort fields.
- Validate file size and MIME type for uploads.
- Hide price fields unless the user has permission to view prices:
  - `unitPrice`
  - `lineAmount`
  - `subtotal`
  - `vatAmount`
  - `totalAmount`
