import { thumbUrl } from "@/lib/catalog";

export const THUMB_SIZE = { 10: "h-10 w-10", 12: "h-12 w-12", 16: "h-16 w-16" } as const;
export type ThumbSize = keyof typeof THUMB_SIZE;

/** Vignette carrée d'un produit ou d'un parfum (miniature Cloudinary), ou case vide sans photo. */
export default function ProductThumb({ url, alt = "", size }: { url: string | null; alt?: string; size: ThumbSize }) {
  const cls = THUMB_SIZE[size];
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={thumbUrl(url)} alt={alt} width={size * 4} height={size * 4} className={`${cls} shrink-0 rounded-lg object-cover ring-1 ring-slate-200`} />
  ) : (
    <div aria-hidden="true" className={`${cls} shrink-0 rounded-lg bg-slate-100 ring-1 ring-slate-200`} />
  );
}
