/** Một dòng vật tư thiếu của Job — `quantity` là **phần thiếu** (`requiredQty − onHand`), không
 * phải toàn bộ nhu cầu. Xem `docs/domains/purchase-requests.md`. */
export type PurchaseRequestShortageItem = {
  materialId: string;
  quantity: number;
};

/** Input của `PurchaseRequestsService.createShortageRequest` — chỉ dựng được từ
 * `ProductionJobsService.startJob`, nơi duy nhất biết đủ cả Job, LSX lẫn bộ phận người bấm start. */
export type CreateShortageRequestInput = {
  departmentId: string;
  productionOrderId: string;
  productionJobId: string;
  createdBy: string;
  items: PurchaseRequestShortageItem[];
};
