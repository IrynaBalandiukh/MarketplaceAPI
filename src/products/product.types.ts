// Mirrors the Product / ProductCreate / ProductPage schemas in openapi/openapi.yaml.
export interface Product {
  id: string;
  title: string;
  description?: string;
  price_cents: number;
  currency: string;
  created_at: string;
}

export interface ProductCreate {
  title: string;
  description?: string;
  price_cents: number;
  currency: string;
}

export interface ProductPage {
  items: Product[];
  next_cursor: string | null;
}
