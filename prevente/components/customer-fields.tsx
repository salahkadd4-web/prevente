import { inputCls, labelCls } from "@/components/ui";

type Values = { businessName?: string; phone?: string | null; address?: string; googleMapsUrl?: string | null; notes?: string | null };

/** Champs communs de création / modification d'un client (préfixe d'id pour éviter les doublons). */
export default function CustomerFields({ prefix, v = {} }: { prefix: string; v?: Values }) {
  return (
    <>
      <div>
        <label htmlFor={`${prefix}-name`} className={labelCls}>Nom de la boutique</label>
        <input id={`${prefix}-name`} name="businessName" required maxLength={120} defaultValue={v.businessName} className={inputCls} />
      </div>
      <div>
        <label htmlFor={`${prefix}-phone`} className={labelCls}>Téléphone (facultatif)</label>
        <input id={`${prefix}-phone`} name="phone" type="tel" inputMode="tel" defaultValue={v.phone ?? ""} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-addr`} className={labelCls}>Adresse</label>
        <input id={`${prefix}-addr`} name="address" required maxLength={300} defaultValue={v.address} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-maps`} className={labelCls}>Lien Google Maps (facultatif)</label>
        <input id={`${prefix}-maps`} name="googleMapsUrl" type="url" inputMode="url" placeholder="https://maps.app.goo.gl/…" defaultValue={v.googleMapsUrl ?? ""} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-notes`} className={labelCls}>Notes (facultatif)</label>
        <input id={`${prefix}-notes`} name="notes" maxLength={1000} defaultValue={v.notes ?? ""} className={inputCls} />
      </div>
    </>
  );
}
