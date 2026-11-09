import { PaymentTerm } from '../database/schemas';

export const PAYMENT_TERM_LABELS: Record<PaymentTerm, string> = {
  [PaymentTerm.IMMEDIATE]: 'Thanh toán ngay',
  [PaymentTerm.NET_15]: 'Net 15 ngày',
  [PaymentTerm.NET_30]: 'Net 30 ngày',
  [PaymentTerm.NET_60]: 'Net 60 ngày',
};
