"use client";

import { type FormEvent, useState, useTransition } from "react";

type Result = { ok: true; id?: string } | { ok: false; error: string };

type Options = { confirm?: string; onSuccess?: (result: Result & { ok: true }) => void };

/** Runs server actions in a transition, tracking busy state and the last error. */
export default function useServerAction() {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<Result>, options: Options = {}) => {
    if (options.confirm && !window.confirm(options.confirm)) return;
    startTransition(async () => {
      // A thrown action (server error, dropped connection) would otherwise bubble up to the error
      // page and replace the whole screen; show it next to the button instead.
      const result = await action().catch((e: unknown): Result => {
        console.error(e);
        return { ok: false, error: "Something went wrong. Please try again." };
      });
      if (result.ok) {
        setError(null);
        options.onSuccess?.(result);
      } else {
        setError(result.error);
      }
    });
  };

  /**
   * Form `onSubmit` handler. Used instead of `<form action>` because React resets uncontrolled
   * inputs after a form action — which would wipe what the user typed when validation fails.
   * The clicked submit button's name/value is included.
   */
  const submitWith =
    (action: (formData: FormData) => Promise<Result>, options?: Options) => (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
      run(() => action(formData), options);
    };

  return { busy, error, setError, run, submitWith };
}
