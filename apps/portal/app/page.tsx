import { redirect } from 'next/navigation';

import { currentMember } from '@/lib/session.ts';

export const dynamic = 'force-dynamic';

/** The portal has no marketing page of its own — the website is that. */
export default async function Index() {
  redirect((await currentMember()) ? '/points' : '/login');
}
