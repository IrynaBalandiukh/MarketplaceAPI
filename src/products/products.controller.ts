import { Body, Controller, Get, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import type { Product, ProductCreate, ProductPage } from "./product.types.js";
import { ProductsService } from "./products.service.js";

@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  listProducts(
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ): ProductPage {
    return this.products.list(Number(limit ?? 20), cursor);
  }

  @Post()
  createProduct(
    @Body() body: ProductCreate,
    @Res({ passthrough: true }) res: Response,
  ): Product {
    const product = this.products.create(body);
    res.setHeader("Location", `/v1/products/${product.id}`);
    return product;
  }

  @Get(":product_id")
  getProduct(@Param("product_id") id: string): Product {
    return this.products.get(id);
  }
}
