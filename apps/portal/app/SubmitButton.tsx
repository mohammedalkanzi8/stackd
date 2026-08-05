'use client';

import { useFormStatus } from 'react-dom';

/**
 * A submit button that shows it is working.
 *
 * Server actions navigate on completion, so between the click and the new page
 * there is a gap with no feedback at all — on shop wifi that gap is long enough
 * for someone to press the button again, which submits the form twice. This
 * disables while pending, spins, and switches the cursor to `progress`.
 *
 * `useFormStatus` only reports the status of the form it is rendered INSIDE,
 * which is why this is its own component rather than a hook call in the page.
 * The page-wide cursor comes from CSS keying on `data-pending`, so no wrapper
 * component is needed around the form itself.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = 'primary',
  formAction,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      formAction={formAction}
      // aria-disabled rather than disabled alone: a disabled button drops out of
      // the accessibility tree mid-interaction, so a screen reader loses the
      // thing the user just pressed.
      disabled={pending}
      aria-disabled={pending}
      data-pending={pending ? 'true' : undefined}
    >
      {pending ? (
        <>
          <span className="spinner" aria-hidden="true" />
          {pendingLabel ?? 'Working…'}
        </>
      ) : (
        children
      )}
    </button>
  );
}
