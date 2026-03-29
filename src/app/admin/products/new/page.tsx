import ProductForm from "../ProductForm";

export default function NewProductPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold" data-testid="new-product-title">
        Add New Product
      </h1>
      <ProductForm mode="create" />
    </div>
  );
}
