import Link from "next/link";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { ORDER_ROW_INCLUDE, toOrderRow } from "@/lib/pharmacy";
import { PLATFORM_FEE_RATE } from "@/lib/payouts";
import PharmacySettingsForm from "@/components/pharmacy/PharmacySettingsForm";
import ProductsManager from "@/components/pharmacy/ProductsManager";
import PharmacyOrdersView from "@/components/pharmacy/PharmacyOrdersView";
import PrescriptionScanner from "@/components/pharmacy/PrescriptionScanner";

export const dynamic = "force-dynamic";

const TABS = { orders: "Orders", products: "Products", scan: "Scan prescription", settings: "Pharmacy & Payouts" } as const;
type Tab = keyof typeof TABS;

/** A pharmacist's own shop: orders to fill, products to sell, and their details. */
export default async function MyPharmacyPage({ searchParams }: { searchParams: Promise<{ tab?: string; done?: string }> }) {
  const me = await requireUser(Role.PHARMACIST);
  const { tab: asked, done } = await searchParams;
  const pharmacy = await prisma.pharmacy.findUnique({ where: { ownerId: me.id } });
  const platformPercent = PLATFORM_FEE_RATE.times(100).toString();

  const settings = pharmacy && {
    name: pharmacy.name,
    address: pharmacy.address,
    city: pharmacy.city,
    phone: pharmacy.phone,
    deliveryFee: pharmacy.deliveryFee?.toString() ?? null,
    latitude: pharmacy.latitude,
    longitude: pharmacy.longitude,
    payoutWallet: pharmacy.payoutWallet,
    payoutAccount: pharmacy.payoutAccount,
  };

  if (!pharmacy) {
    return (
      <div className="settings">
        <h2 className="section-heading">My Pharmacy</h2>
        <PharmacySettingsForm pharmacy={null} platformPercent={platformPercent} />
      </div>
    );
  }

  const tab: Tab = asked && asked in TABS ? (asked as Tab) : "orders";
  const since = new Date(Date.now() - 30 * 86400000);
  const [open, finished, products, sold, earned] = await Promise.all([
    prisma.pharmacyOrder.findMany({
      where: { pharmacyId: pharmacy.id, status: { in: ["PAID", "DISPATCHED", "DELIVERED", "DISPUTED"] } },
      include: ORDER_ROW_INCLUDE,
      orderBy: { paidAt: "asc" },
    }),
    done
      ? prisma.pharmacyOrder.findMany({
          where: { pharmacyId: pharmacy.id, status: { in: ["RECEIVED", "CANCELLED"] }, paidAt: { not: null } },
          include: ORDER_ROW_INCLUDE,
          orderBy: { updatedAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
    tab === "products" ? prisma.pharmacyProduct.findMany({ where: { pharmacyId: pharmacy.id }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }) : Promise.resolve([]),
    tab === "products"
      ? prisma.pharmacyOrderItem.groupBy({
          by: ["productId"],
          where: { order: { pharmacyId: pharmacy.id, paidAt: { gte: since }, status: { not: "CANCELLED" } } },
          _sum: { quantity: true },
        })
      : Promise.resolve([]),
    prisma.payout.aggregate({ where: { recipientId: me.id, kind: "PHARMACY_SHARE", status: "COMPLETED" }, _sum: { amount: true } }),
  ]);
  const soldBy = new Map(sold.map((s) => [s.productId, s._sum.quantity ?? 0]));
  const toFill = open.filter((o) => o.status === "PAID").length;

  return (
    <div className="settings">
      <div className="appt-header">
        <div>
          <h2 className="section-heading">{pharmacy.name}</h2>
          <p className="section-sub">
            {toFill > 0 ? `${toFill} order${toFill === 1 ? "" : "s"} to prepare · ` : ""}Paid to you so far:{" "}
            {formatMoney((earned._sum.amount ?? new Prisma.Decimal(0)).toString())}
            {!pharmacy.isActive && " · Hidden from the shop by MiDokta"}
          </p>
        </div>
      </div>
      {!pharmacy.payoutWallet && (
        <div className="stock-alert">
          <i className="fa-solid fa-triangle-exclamation" /> Add your payout number under{" "}
          <Link href="/staff/pharmacy?tab=settings">Pharmacy &amp; Payouts</Link> so you can be paid for orders.
        </div>
      )}

      <div className="all-header">
        <div className="segmented" role="tablist">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <Link key={t} href={`/staff/pharmacy?tab=${t}`} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""}>
              {TABS[t]}
              {t === "orders" && open.length > 0 && ` (${open.length})`}
            </Link>
          ))}
        </div>
      </div>

      {tab === "orders" && (
        <>
          <PharmacyOrdersView orders={open.map(toOrderRow)} as="pharmacy" empty="No orders to fill right now." />
          {done ? (
            <>
              <h3 className="details-subhead">Finished orders</h3>
              <PharmacyOrdersView orders={finished.map(toOrderRow)} as="pharmacy" empty="No finished orders yet." />
            </>
          ) : (
            <p className="form-note">
              <Link href="/staff/pharmacy?tab=orders&done=1">Show finished orders</Link>
            </p>
          )}
        </>
      )}
      {tab === "products" && (
        <ProductsManager
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            strength: p.strength,
            form: p.form,
            description: p.description,
            imageUrl: p.imageUrl,
            price: p.price.toString(),
            quantity: p.quantity,
            isActive: p.isActive,
            sold30d: soldBy.get(p.id) ?? 0,
          }))}
        />
      )}
      {tab === "scan" && <PrescriptionScanner mode="pharmacist" />}
      {tab === "settings" && <PharmacySettingsForm pharmacy={settings} platformPercent={platformPercent} />}
    </div>
  );
}
