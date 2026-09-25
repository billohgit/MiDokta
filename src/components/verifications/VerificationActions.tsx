"use client";

import { approveSignup, rejectSignup, rerunVerification } from "@/app/actions/verification";
import useServerAction from "@/components/ui/useServerAction";

type Props = { id: string; name: string; checking: boolean };

export default function VerificationActions({ id, name, checking }: Props) {
  const { busy, error, run } = useServerAction();

  return (
    <div className="verify-actions">
      {error && <small className="form-error">{error}</small>}
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={busy || checking}
        onClick={() => run(() => rerunVerification(id))}
      >
        <i className="fa-solid fa-rotate btn-icon" /> Run check again
      </button>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={busy}
        onClick={() =>
          run(() => rejectSignup(id), {
            confirm: `Reject ${name}? Their account, photo and ID card will be deleted.`,
          })
        }
      >
        <i className="fa-solid fa-xmark btn-icon" /> Reject
      </button>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={busy}
        onClick={() => run(() => approveSignup(id), { confirm: `Approve ${name}? They'll be able to sign in.` })}
      >
        <i className="fa-solid fa-check btn-icon" /> Approve
      </button>
    </div>
  );
}
