import { motion } from "framer-motion";
import { useState } from "react";
import { ETAPA_META, type FollowUpBucket, type FollowUpCard } from "../data/types";
import { etiquetaVisita } from "../lib/format";
import { navigate } from "../router";
import { useHub, useNow } from "../store";

const GROUPS: Array<{ id: FollowUpBucket; title: string; subtitle: string; icon: string }> = [
  // Primero los que ya dijeron cuándo vienen: es lo único de esta pantalla que
  // tiene una fecha encima, y el que prometió y no apareció está al principio.
  { id: "visita_confirmada", title: "Dijeron qué día vienen", subtitle: "Confirmar la hora y tener las llantas listas; los atrasados van primero", icon: "🗓" },
  { id: "needs_human", title: "Revisión humana", subtitle: "Solicitudes de asesor o ventana cerrada; responder y decidir el siguiente paso", icon: "👤" },
  { id: "closing", title: "Recta final", subtitle: "Visitas, reservas y compromisos que todavía podemos convertir", icon: "🏁" },
];

/** Fecha por la que ordenar. Sin fecha = sin plazo = al final de la lista. */
function cuando(item: FollowUpCard): number {
  const t = new Date(item.visitDate ?? item.pickupDate ?? item.dueAt ?? 0).getTime();
  return t || Number.POSITIVE_INFINITY;
}

function OpportunityCard({ item, now }: { item: FollowUpCard; now: number }) {
  const followUpAction = useHub((state) => state.followUpAction);
  const [generating, setGenerating] = useState(false);
  const commitment = item.commitment || (item.visitDate ? `Visita: ${new Date(item.visitDate).toLocaleString("es-EC")}` : null)
    || (item.pickupDate ? `Retiro: ${new Date(item.pickupDate).toLocaleDateString("es-EC")}` : null);
  const next = item.dueAt ? new Date(item.dueAt).toLocaleString("es-EC", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : null;
  const silenceHours = item.lastAt ? Math.max(0, Math.floor((now - new Date(item.lastAt).getTime()) / 3_600_000)) : 0;
  // Solo los seguimientos de texto se redactan; las plantillas llevan copy aprobado por Meta.
  const editable = Boolean(item.id) && item.status === "scheduled" && !item.templateRequired;
  return <motion.div
    layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
    className="glass grid w-full gap-2 rounded-2xl p-3 text-left shadow-soft transition-transform hover:-translate-y-0.5 hover:border-lime/25"
  >
    <button onClick={() => navigate(`ticket/${item.conversationId}`)} className="grid w-full gap-2 text-left sm:grid-cols-[minmax(0,1fr)_auto]">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="truncate text-[13px] font-black">{item.customer}</span>
        <span className="rounded-full bg-paper/[.07] px-2 py-0.5 text-[9px] font-bold">{ETAPA_META[item.stage].corto}</span>
        <span className={`max-w-full truncate rounded-full px-2 py-0.5 text-[9px] font-black ${item.bucket === "needs_human" ? "bg-red/10 text-red" : "bg-lime/10 text-lime"}`} title={item.importanceReason}>
          {item.importanceLabel}
        </span>
        {item.bucket === "needs_human" && <span className="rounded-full bg-paper/[.07] px-2 py-0.5 text-[9px] font-bold">Sin responder {item.unansweredDays} d</span>}
      </div>
      <p className="mt-1 line-clamp-1 text-[10.5px] text-muted">{item.tireSize || item.selectedProductCode || "Medida pendiente"} · {item.summary}</p>
      <p className="mt-1 line-clamp-1 text-[10px] font-bold text-amber-500">⚡ {item.importanceReason}</p>
      {commitment && (() => {
        // El día en grande y con color: verde si todavía puede pasar, rojo si
        // la fecha ya pasó — «prometió el lunes y no vino» es la tarjeta que
        // más urge trabajar, y antes se leía igual que las demás.
        const dia = etiquetaVisita(item.visitDate ?? undefined, item.commitment ?? undefined, now);
        const vencida = Boolean(item.visitDate) && new Date(item.visitDate!).getTime() < now - 86_400_000;
        return <p
          className="mt-1 rounded-lg px-2 py-1 text-[10.5px] font-black"
          style={vencida
            ? { background: "color-mix(in srgb, var(--color-red) 12%, transparent)", color: "var(--color-red)" }
            : { background: "color-mix(in srgb, var(--color-lime) 10%, transparent)", color: "var(--color-lime)" }}
        >
          🗓 {dia ? `${dia} · ` : ""}{vencida ? "no apareció — " : ""}dijo: {commitment}
        </p>;
      })()}
      {item.discountCondition && <p className="mt-1 line-clamp-1 text-[10px] font-bold text-amber-500">🏷️ Condición del descuento extra: {item.discountCondition}</p>}
    </div>
    <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
      <p className="tnum text-[10px] font-bold">{next ? `Próximo: ${next}` : "Requiere decisión"}</p>
      <p className="mt-1 text-[9.5px] text-faint">{item.campaignPlan.length ? `${item.campaignPlan.length} plantillas programadas` : `${silenceHours} h desde actividad`}</p>
    </div>
    </button>
    {editable && <div className="rounded-xl bg-paper/[.045] px-2.5 py-2">
      <p className="text-[9px] font-black uppercase tracking-wider text-faint">
        {item.aiPending ? "Borrador · se redacta al enviar" : "Mensaje listo"}
      </p>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed">{item.preview}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {item.aiPending && <button
          disabled={generating}
          onClick={() => { setGenerating(true); void followUpAction(item.id!, "generate").finally(() => setGenerating(false)); }}
          className="rounded-md bg-violet/15 px-2 py-1 text-[9.5px] font-bold disabled:opacity-40"
        >{generating ? "Redactando…" : "Generar con IA"}</button>}
        <button
          onClick={() => { const value = window.prompt("Editar mensaje", item.preview); if (value?.trim()) void followUpAction(item.id!, "edit", value.trim()); }}
          className="rounded-md bg-paper/10 px-2 py-1 text-[9.5px] font-bold"
        >Editar</button>
        <button
          onClick={() => { if (window.confirm(`¿Enviar ahora este mensaje a ${item.customer}?`)) void followUpAction(item.id!, "send"); }}
          className="rounded-md bg-lime/15 px-2 py-1 text-[9.5px] font-bold"
        >Enviar ahora</button>
      </div>
    </div>}
  </motion.div>;
}

export function Opportunities() {
  const items = useHub((state) => state.followUps);
  const now = useNow();
  return <div className="h-full overflow-y-auto px-4 pb-8">
    <div className="mx-auto grid max-w-5xl gap-5">
      <div className="rounded-2xl border border-lime/10 bg-lime/[.035] px-4 py-3 text-[11px] text-muted">
        Aquí aparecen únicamente clientes que requieren una decisión humana y ventas que están en la recta final. Los seguimientos normales siguen trabajando en segundo plano.
      </div>
      {GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.bucket === group.id).sort((a, b) => {
          if (group.id === "needs_human") return b.unansweredDays - a.unansweredDays;
          // Ascendente: la fecha más vieja primero. En "dijeron qué día vienen"
          // eso pone arriba a los que ya debieron aparecer y no aparecieron.
          // Sin fecha van al FINAL: «este fin de semana» no tiene plazo encima,
          // así que no puede desplazar a alguien que viene mañana.
          return cuando(a) - cuando(b);
        });
        return <section key={group.id}>
          <div className="mb-2 flex items-center gap-2"><span>{group.icon}</span><h2 className="text-xs font-black uppercase tracking-wide">{group.title}</h2><span className="tnum rounded-full bg-paper/10 px-2 text-[10px]">{groupItems.length}</span><p className="ml-auto hidden text-[10px] text-faint md:block">{group.subtitle}</p></div>
          <div className="grid gap-2">{groupItems.length ? groupItems.map((item) => <OpportunityCard key={item.conversationId} item={item} now={now} />) : <div className="rounded-2xl border border-dashed border-paper/[.08] p-7 text-center text-[11px] text-faint">Sin oportunidades en este grupo</div>}</div>
        </section>;
      })}
    </div>
  </div>;
}
