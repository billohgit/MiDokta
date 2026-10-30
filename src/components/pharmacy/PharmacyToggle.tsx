"use client";

import { setPharmacyActive } from "@/app/actions/pharmacy";
import useServerAction from "@/components/ui/useServerAction";

/** An admin's switch to take a pharmacy off the shop or put it back. */
export default function PharmacyToggle({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const { busy, error, run } = useServerAction();
  return (
    <>
      <button
        className="btn btn-sm btn-outline"
        disabled={busy}
        onClick={() =>
          run(() => setPharmacyActive(id, !isActive), {
            confirm: isActive ? `Hide ${name} from the shop? Its open orders carry on, and patients' carts from it are emptied.` : undefined,
          })
        }
      >
        {isActive ? "Hide from shop" : "Show in shop"}
      </button>
      {error && <span className="form-error">{error}</span>}
    </>
  );
}
