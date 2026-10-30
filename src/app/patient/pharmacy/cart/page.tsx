import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import CartView from "@/components/pharmacy/CartView";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const patient = await requireUser(Role.PATIENT);
  const items = await prisma.cartItem.findMany({
    where: { userId: patient.id },
    include: { product: { include: { pharmacy: true } } },
    orderBy: { createdAt: "asc" },
  });
  const pharmacy = items[0]?.product.pharmacy ?? null;

  return (
    <CartView
      lines={items.map((i) => ({
        productId: i.productId,
        name: i.product.name,
        detail: [i.product.strength, i.product.form].filter(Boolean).join(" · "),
        unitPrice: i.product.price.toNumber(),
        quantity: i.quantity,
        inStock: i.product.quantity,
      }))}
      pharmacy={pharmacy && { name: pharmacy.name, address: pharmacy.address, deliveryFee: pharmacy.deliveryFee?.toNumber() ?? null }}
      phone={patient.phone}
      address={[patient.address, patient.city].filter(Boolean).join(", ") || null}
    />
  );
}
