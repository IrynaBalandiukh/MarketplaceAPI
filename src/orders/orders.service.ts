import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { paginate } from '../common/pagination.js';
import { ProductsService } from '../products/products.service.js';
import type { Order, OrderCreate, OrderPage } from './order.types.js';

interface IdempotencyRecord {
  fingerprint: string;
  order: Order;
}

@Injectable()
export class OrdersService {
  private readonly orders: Order[] = [];
  private readonly idempotency = new Map<string, IdempotencyRecord>();

  constructor(private readonly products: ProductsService) {}

  // Same key + same body -> the original order, nothing new is created.
  // Same key + different body -> 422: the client reused a key for another operation.
  create(
    input: OrderCreate,
    idempotencyKey: string,
  ): { order: Order; replayed: boolean } {
    const fingerprint = JSON.stringify(
      input.items.map(({ product_id, quantity }) => ({ product_id, quantity })),
    );

    const seen = this.idempotency.get(idempotencyKey);
    if (seen) {
      if (seen.fingerprint !== fingerprint) {
        throw new UnprocessableEntityException(
          'Idempotency-Key was already used with a different request body',
        );
      }
      return { order: seen.order, replayed: true };
    }

    const order = this.build(input);
    this.orders.push(order);
    this.idempotency.set(idempotencyKey, { fingerprint, order });
    return { order, replayed: false };
  }

  get(id: string): Order {
    const order = this.orders.find((o) => o.id === id);
    if (!order) throw new NotFoundException(`Order ${id} does not exist`);
    return order;
  }

  list(limit: number, cursor?: string): OrderPage {
    return paginate(this.orders, limit, cursor);
  }

  private build(input: OrderCreate): Order {
    let total_cents = 0;
    let currency: string | undefined;

    for (const { product_id, quantity } of input.items) {
      const product = this.products.find(product_id);
      // The URL (/orders) exists and the body is well-formed, but it points at a
      // product that does not: a rule violation (422), not a missing resource (404).
      if (!product) throw new UnprocessableEntityException(`Product ${product_id} does not exist`);

      currency ??= product.currency;
      if (product.currency !== currency) {
        throw new UnprocessableEntityException('All items in one order must share a currency');
      }
      total_cents += product.price_cents * quantity;
    }

    return {
      id: randomUUID(),
      status: 'pending',
      items: input.items,
      total_cents,
      currency: currency!,
      created_at: new Date().toISOString(),
    };
  }
}
