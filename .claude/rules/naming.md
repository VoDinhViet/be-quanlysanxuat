# Naming

- Name a variable after what it holds, not after its shape. Never use generic names such as `rows`, `row`, `data`, `result`, `res`, `list`, `entries` or `items` (unless the value really is an `items` row) for query results or intermediate values. Name the thing: `lastPurchases`, `purchasedSuppliers`, `requisitions`, `receiptPurchaseSources`.
- A query result takes the plural of its entity (`requisitions`, `suppliers`); a callback parameter takes the singular (`(purchase) => ...`, `(supplier) => ...`). Do not shorten to `r`, `x` or `row`.
- A `Map` is named `<value>By<Key>` (`supplierById`, `sourcesByReceiptId`); a `Set` or id list says what the ids identify (`issueIds`, `supplierIds`).
- An `id`-shaped parameter says which entity it identifies (`receiptId`, `quotationId`), never a bare `id`, once a function handles more than one kind of entity.
- Two layers of the same entity get different names (`purchaseOrder` the table row, `paymentRequest` the other document); never reuse one name for two different documents in one scope.
- Apply this to code you touch or add. Do not rename unrelated existing variables in the same change.
