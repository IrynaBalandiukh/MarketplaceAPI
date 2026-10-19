import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { paginate } from '../common/pagination.js';
import type { Product, ProductCreate, ProductPage } from './product.types.js';

@Injectable()
export class ProductsService {
  private readonly products: Product[] = [];

  create(input: ProductCreate): Product {
    const product: Product = {
      id: randomUUID(),
      ...input,
      created_at: new Date().toISOString(),
    };
    this.products.push(product);
    return product;
  }

  get(id: string): Product {
    const product = this.find(id);
    if (!product) throw new NotFoundException(`Product ${id} does not exist`);
    return product;
  }

  find(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  list(limit: number, cursor?: string): ProductPage {
    return paginate(this.products, limit, cursor);
  }
}
