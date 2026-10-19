import { Body, Controller, Get, Headers, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { Order, OrderCreate, OrderPage } from './order.types.js';
import { OrdersService } from './orders.service.js';

// As with products, the spec is enforced at the border by express-openapi-validator,
// including the required Idempotency-Key header.
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  listOrders(@Query('limit') limit?: string, @Query('cursor') cursor?: string): OrderPage {
    return this.orders.list(Number(limit ?? 20), cursor);
  }

  @Post()
  createOrder(
    @Body() body: OrderCreate,
    @Headers('idempotency-key') idempotencyKey: string,
    @Res({ passthrough: true }) res: Response,
  ): Order {
    const { order, replayed } = this.orders.create(body, idempotencyKey);
    res.setHeader('Location', `/v1/orders/${order.id}`);
    if (replayed) res.setHeader('Idempotency-Replay', 'true');
    return order;
  }

  @Get(':order_id')
  getOrder(@Param('order_id') id: string): Order {
    return this.orders.get(id);
  }
}
