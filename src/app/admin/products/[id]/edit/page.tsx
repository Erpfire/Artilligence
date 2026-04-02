import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import ProductForm from "../../ProductForm";

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  const product = await prisma.product.findUnique({
    where: { id: params.id },
  });

  if (!product) {
    notFound();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold" data-testid="edit-product-title">
        Edit Product
      </h1>
      <ProductForm
        mode="edit"
        initialData={{
          id: product.id,
          name: product.name,
          nameHi: product.nameHi || "",
          description: product.description || "",
          descriptionHi: product.descriptionHi || "",
          price: product.price.toString(),
          sku: product.sku || "",
          category: product.category || "",
          imageUrl: product.imageUrl || "",
          warranty: product.warranty || "",
          ah: product.ah || "",
          remark: product.remark || "",
          isActive: product.isActive,
        }}
      />
    </div>
  );
}
