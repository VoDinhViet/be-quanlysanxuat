export enum ErrorCode {
  // Common Validation
  V000 = 'common.validation.error',

  // Validation
  V001 = 'user.validation.is_empty',
  V002 = 'user.validation.is_invalid',

  // Error
  E001 = 'credential.error.username_or_email_exists',
  E002 = 'credential.error.not_found',
  E003 = 'credential.error.email_exists',
  E004 = 'credential.error.invalid_credentials',
  E005 = 'user.error.code_exists',
  E006 = 'product.error.locked',
  E007 = 'product.error.not_found',
  E008 = 'product.error.code_exists',
  E009 = 'client.error.not_found',
  E010 = 'product_group.error.not_found',
  E011 = 'unit.error.not_found',
  E012 = 'user.error.not_found',
  E013 = 'user.error.id_number_exists',
  E014 = 'department.error.not_found',
  E015 = 'position.error.not_found',
  E016 = 'upload.error.invalid_file',
  E017 = 'upload.error.file_too_large',
  E018 = 'user.error.resigned',
  // Suppliers domain. Retired when the module was removed earlier on 2026-07-20, then restored
  // with their original meanings when it was rolled back the same day — so no client ever saw
  // these codes point at anything else.
  E019 = 'supplier.error.not_found',
  E020 = 'supplier.error.code_exists',
  E021 = 'supplier_group.error.not_found',
  E022 = 'supplier.error.tax_code_exists',
  // Only throw site is SuppliersService (country ref on a supplier).
  E023 = 'country.error.not_found',
  E024 = 'client.error.code_exists',
  E025 = 'client.error.tax_code_exists',
  E026 = 'client_group.error.not_found',
  E027 = 'role.error.not_found',
  E028 = 'role.error.code_exists',
  E029 = 'role.error.in_use',
  E030 = 'role.error.system_readonly',
  E031 = 'role.error.invalid_permission',
  E032 = 'user.error.no_credential',
  E033 = 'auth.error.forbidden',
  E034 = 'role.error.elevation_forbidden',
  E035 = 'material.error.not_found',
  E036 = 'material.error.code_exists',
  E037 = 'material_group.error.not_found',
  // E038 (material_group.code_exists) and E039 (material_group.in_use) stay reserved with their
  // original meanings — the material-group CRUD that would raise them isn't built yet.
  E040 = 'material.error.client_required',
  // Blocks `DELETE /materials/:materialId` when the material is still referenced by at least one
  // `bom_items` node — the FK is `onDelete: 'restrict'`, so this turns what would otherwise be a
  // raw 500 into a clean 409.
  E041 = 'material.has_transactions',
  E042 = 'file.error.not_found',
  // The unit exists but isn't assignable to this kind of entity (e.g. `Mét` on a product) —
  // deliberately distinct from E011 so the client can tell a bad id from a wrong-scope unit.
  E043 = 'unit.error.scope_mismatch',
  // Download-URL signature failures. Kept distinct on purpose: E045 means "ask the API for the
  // entity again to get a fresh link" (routine, the URL simply aged out), while E044 means the
  // link was tampered with or minted elsewhere — worth surfacing differently, and worth logging.
  E044 = 'file.error.invalid_signature',
  E045 = 'file.error.url_expired',
  E046 = 'operation.error.not_found',
  E047 = 'operation.error.code_exists',
  // E048/E049 (product_revision not_found/number_exists) stay reserved — the product-revisions
  // module was removed in favor of whole-product copy/clone (`POST /products/:id/copy`); no
  // current throw site uses them.
  E050 = 'bom_item.error.not_found',
  E051 = 'bom_item.error.parent_not_found',
  E052 = 'bom_item.error.parent_is_material',
  E053 = 'bom_item.error.product_not_wip',
  E054 = 'bom_item.error.cycle_detected',
  E055 = 'bom_item.error.quantity_not_integer',
  E056 = 'routing_step.error.not_found',
  E057 = 'order.error.not_found',
  E058 = 'order.error.code_exists',
  E059 = 'order.error.client_not_found',
  E060 = 'order.error.staff_not_found',
  E061 = 'order.error.product_not_found',
  // `bomItemId` on a routing route doesn't reference a `bom_items` row within the URL's own
  // product BOM — either it doesn't exist at all, or it belongs to a different product's tree.
  E062 = 'routing_step.error.bom_item_not_found',
  // The `bomItemId` node exists and belongs to this product's BOM, but is a MATERIAL leaf —
  // vật tư nodes never carry their own routing.
  E063 = 'routing_step.error.material_node',
  // `positionId` on a user create/update exists (E015 already passed) but doesn't belong to the
  // effective `departmentId` (the one sent, or the user's current one when only one of the pair
  // is being changed).
  E064 = 'position.error.department_mismatch',
  E101 = 'class.error.teacher_not_found',
  E102 = 'class.error.invalid_teacher_assignment',
  E103 = 'class.error.forbidden',
  E104 = 'class.error.unique_code_generation_failed',
  E105 = 'class.error.not_found',
  V003 = 'common.error.too_many_requests',
}
