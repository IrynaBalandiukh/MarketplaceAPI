import type { Page } from '../common/pagination.js';

// Mirrors the Order / OrderItem / OrderCreate / OrderPage schemas in openapi/openapi.yaml.
export interface OrderItem {
  product_id: string;
  quantity: number;
}

export interface OrderCreate {
  items: OrderItem[];
}

export interface Order {
  id: string;
  status: 'pending' | 'paid' | 'shipped' | 'cancelled';
  items: OrderItem[];
  total_cents: number;
  currency: string;
  created_at: string;
}

export type OrderPage = Page<Order>;
