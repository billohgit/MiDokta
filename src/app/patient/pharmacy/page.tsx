import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import ShopView from "@/components/pharmacy/ShopView";

export const dynamic = "force-dynamic";

/** The pharmacy shop: every active pharmacy's products that are in stock. */
export default async function PharmacyShopPage() {
  const patient = await requireUser(Role.PATIENT);
  const [products, cart] = await Promise.all([
    prisma.pharmacyProduct.findMany({
      where: { isActive: true, quantity: { gt: 0 }, pharmacy: { isActive: true } },
      include: { pharmacy: { select: { id: true, name: true, city: true } } },
      orderBy: [{ name: "asc" }, { price: "asc" }],
      take: 500,
    }),
    prisma.cartItem.findMany({ where: { userId: patient.id }, include: { product: { select: { pharmacy: { select: { name: true } } } } } }),
  ]);

  return (
    <ShopView
      cartCount={cart.reduce((n, i) => n + i.quantity, 0)}
      cartPharmacy={cart[0]?.product.pharmacy.name ?? null}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        detail: [p.strength, p.form].filter(Boolean).join(" · "),
        description: p.description,
        price: formatMoney(p.price.toString()),
        inStock: p.quantity,
        pharmacyId: p.pharmacy.id,
        pharmacyName: p.pharmacy.name,
        pharmacyCity: p.pharmacy.city,
      }))}
    />
  );
}
