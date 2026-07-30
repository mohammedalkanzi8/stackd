import type { MenuItem, Locale } from '@stackd/shared';

/**
 * Photo area for a menu card.
 *
 * When an item has no `image` yet, this renders a branded placeholder rather
 * than a grey box or a broken image icon — the checkerboard from the menu
 * artwork behind the logo mark. It reads as deliberate, so the site looks
 * finished while photography is still outstanding.
 *
 * Drop a file into `apps/web/public/menu/` and set `image` on the item to
 * replace it. Nothing else changes.
 */
export function CardMedia({ item, locale }: { item: MenuItem; locale: Locale }) {
  const name = locale === 'ar' ? item.nameAr : item.nameEn;

  if (!item.image) {
    return (
      <div className="card-media card-media-empty" role="presentation">
        <img className="card-media-mark" src="/brand/logo.svg" alt="" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="card-media">
      <img
        src={item.image}
        // Decorative relative to the heading that follows it, which already
        // names the dish. An alt of "Big-Stackd" would just repeat it.
        alt=""
        loading="lazy"
        decoding="async"
        width={1200}
        height={900}
        aria-hidden="true"
        data-item={name}
      />
    </div>
  );
}
