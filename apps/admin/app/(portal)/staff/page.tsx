import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { ROLE_LABEL, requireRole, requireStaff, type Role } from '@/lib/auth.ts';
import { query, queryOne, transaction } from '@/lib/db.ts';
import { hashPassword } from '@/lib/password.ts';

export const metadata = { title: 'Staff · STACKD admin' };
export const dynamic = 'force-dynamic';

interface StaffRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
  is_active: boolean;
  branch: string;
  has_password: boolean;
  adjustments: number;
  created_at: Date;
}

const BACK = '/staff';
const ROLES: Role[] = ['cashier', 'kitchen', 'manager', 'owner'];

function fail(message: string): never {
  redirect(`${BACK}?error=${encodeURIComponent(message)}`);
}

function done(message: string): never {
  revalidatePath(BACK);
  redirect(`${BACK}?ok=${encodeURIComponent(message)}`);
}

/**
 * Only an owner manages staff. A manager who could promote themselves to owner
 * is not a manager.
 */
async function addStaff(formData: FormData): Promise<void> {
  'use server';
  await requireRole('owner');

  const name = String(formData.get('fullName') ?? '').trim();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const role = String(formData.get('role') ?? '') as Role;
  const password = String(formData.get('password') ?? '');

  if (!name) fail('Give them a name — it appears on every point adjustment they make.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('That is not an email address.');
  if (!ROLES.includes(role)) fail('Pick a role.');
  if (password.length < 8) fail('The password must be at least 8 characters.');

  const branch = await queryOne<{ id: string }>('select id from branches order by created_at limit 1');
  if (!branch) fail('There is no branch to attach them to.');

  const existing = await queryOne('select 1 from auth.users where lower(email) = $1', [email]);
  if (existing) fail(`${email} is already in use.`);

  const hash = await hashPassword(password);

  // auth.users, staff and the credential go in together or not at all — a staff
  // row pointing at a half-made user is worse than a failed form.
  await transaction(async (c) => {
    const { rows } = await c.query(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    const id = rows[0].id;
    await c.query(
      'insert into staff (id, branch_id, role, full_name) values ($1, $2, $3, $4)',
      [id, branch.id, role, name],
    );
    await c.query(
      'insert into staff_credentials (staff_id, password_hash) values ($1, $2)',
      [id, hash],
    );
  });

  done(`${name} can now sign in as ${ROLE_LABEL[role].toLowerCase()}.`);
}

async function changeRole(formData: FormData): Promise<void> {
  'use server';
  const me = await requireRole('owner');

  const id = String(formData.get('id') ?? '');
  const role = String(formData.get('role') ?? '') as Role;
  if (!ROLES.includes(role)) fail('Pick a role.');
  if (id === me.id) fail('You cannot change your own role — ask another owner.');

  const rows = await query<{ full_name: string | null }>(
    'update staff set role = $2 where id = $1 returning full_name',
    [id, role],
  );
  if (rows.length === 0) fail('That person is no longer here.');
  done(`${rows[0].full_name} is now ${ROLE_LABEL[role].toLowerCase()}.`);
}

/**
 * Deactivates rather than deletes.
 *
 * `loyalty_transactions.actor_id` points at them: deleting the row would either
 * fail on the reference or strip the name off every adjustment they ever made,
 * and those names are the whole reason the column exists. Deactivating stops
 * them signing in and leaves the history intact.
 */
async function setActive(formData: FormData): Promise<void> {
  'use server';
  const me = await requireRole('owner');

  const id = String(formData.get('id') ?? '');
  const active = formData.get('active') === '1';
  if (id === me.id) fail('You cannot deactivate yourself.');

  const rows = await query<{ full_name: string | null }>(
    'update staff set is_active = $2 where id = $1 returning full_name',
    [id, active],
  );
  if (rows.length === 0) fail('That person is no longer here.');
  done(`${rows[0].full_name} ${active ? 'can sign in again' : 'can no longer sign in'}.`);
}

async function resetPassword(formData: FormData): Promise<void> {
  'use server';
  await requireRole('owner');

  const id = String(formData.get('id') ?? '');
  const password = String(formData.get('password') ?? '');
  if (password.length < 8) fail('The password must be at least 8 characters.');

  const person = await queryOne<{ full_name: string | null }>(
    'select full_name from staff where id = $1',
    [id],
  );
  if (!person) fail('That person is no longer here.');

  await query(
    `insert into staff_credentials (staff_id, password_hash) values ($1, $2)
     on conflict (staff_id) do update
       set password_hash = excluded.password_hash, updated_at = now()`,
    [id, await hashPassword(password)],
  );
  done(`New password set for ${person.full_name}.`);
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; reset?: string }>;
}) {
  const me = await requireStaff();
  const { ok, error, reset } = await searchParams;
  const isOwner = me.role === 'owner';

  const people = await query<StaffRow>(`
    select s.id, s.full_name, s.role, s.is_active, s.created_at,
           u.email, b.name_en as branch,
           (c.staff_id is not null) as has_password,
           (select count(*)::int from loyalty_transactions t where t.actor_id = s.id) as adjustments
      from staff s
      join auth.users u on u.id = s.id
      join branches b on b.id = s.branch_id
      left join staff_credentials c on c.staff_id = s.id
     order by s.is_active desc, s.role, s.full_name
  `);

  const resetting = reset ? people.find((p) => p.id === reset) : undefined;

  return (
    <>
      <p className="eyebrow">People</p>
      <h1>Staff and permissions</h1>
      <p className="lede">
        Cashiers and the kitchen can look members up. Managers can also change
        points, rewards and prices. Only an owner can manage this page.
      </p>

      {ok ? <div className="banner ok">{ok}</div> : null}
      {error ? <div className="banner bad">{error}</div> : null}

      <div className="card" style={{ marginBlockEnd: 22 }}>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th className="right">Adjustments</th>
                <th className="right">Status</th>
                {isOwner ? <th className="right"></th> : null}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.full_name ?? '—'}</b>
                    {p.id === me.id ? (
                      <span className="chip" style={{ marginInlineStart: 6 }}>
                        you
                      </span>
                    ) : null}
                    {!p.has_password ? (
                      <span className="chip warn" style={{ marginInlineStart: 6 }}>
                        no password
                      </span>
                    ) : null}
                  </td>
                  <td className="mono muted">{p.email}</td>
                  <td>
                    {isOwner && p.id !== me.id ? (
                      <form action={changeRole} className="row" style={{ gap: 6 }}>
                        <input type="hidden" name="id" value={p.id} />
                        <select name="role" defaultValue={p.role} style={{ width: 130 }}>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                        <button type="submit">Set</button>
                      </form>
                    ) : (
                      ROLE_LABEL[p.role]
                    )}
                  </td>
                  <td className="right num muted">{p.adjustments}</td>
                  <td className="right">
                    <span className={`chip ${p.is_active ? 'on' : 'off'}`}>
                      {p.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  {isOwner ? (
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      {p.id === me.id ? (
                        <span className="muted" style={{ fontSize: 13 }}>
                          —
                        </span>
                      ) : (
                        <>
                          <a className="btn" href={`?reset=${p.id}`}>
                            Password
                          </a>{' '}
                          <form action={setActive} style={{ display: 'inline' }}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="active" value={p.is_active ? '0' : '1'} />
                            <button type="submit" className="quiet">
                              {p.is_active ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </form>
                        </>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 13, marginBlockEnd: 0 }}>
          Staff are deactivated, never deleted — their name is on every point
          adjustment they ever made, and that history is the reason the column
          exists.
        </p>
      </div>

      {isOwner && resetting ? (
        <div className="card" style={{ marginBlockEnd: 22 }}>
          <h2>New password for {resetting.full_name}</h2>
          <form action={resetPassword} className="row" style={{ marginBlockStart: 12 }}>
            <input type="hidden" name="id" value={resetting.id} />
            <div className="field">
              <label htmlFor="password">
                Password <span className="hint">— at least 8 characters</span>
              </label>
              <input id="password" name="password" type="password" required autoFocus minLength={8} />
            </div>
            <button type="submit" className="primary">
              Set password
            </button>
            <a className="btn" href="/staff">
              Cancel
            </a>
          </form>
        </div>
      ) : null}

      {isOwner ? (
        <div className="card">
          <h2>Add someone</h2>
          <p className="lede" style={{ marginBlockEnd: 16 }}>
            They can sign in immediately with the password you set here.
          </p>
          <form action={addStaff} className="stack">
            <div className="row">
              <div className="field">
                <label htmlFor="fullName">Name</label>
                <input id="fullName" name="fullName" type="text" required />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" required />
              </div>
              <div className="field field-sm">
                <label htmlFor="role">Role</label>
                <select id="role" name="role" defaultValue="cashier">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field field-sm">
                <label htmlFor="newPassword">Password</label>
                <input
                  id="newPassword"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" className="primary">
                Add
              </button>
            </div>
          </form>
          <p className="muted" style={{ fontSize: 13, marginBlockStart: 14, marginBlockEnd: 0 }}>
            This writes to <code>auth.users</code>, which is ours only while the
            database is self-hosted. If staff ever move to Supabase&rsquo;s own auth,
            adding people happens there instead and this form goes away.
          </p>
        </div>
      ) : (
        <p className="muted">Only an owner can add or change staff.</p>
      )}
    </>
  );
}
