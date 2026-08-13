"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Cable, Columns3, MessagesSquare, Send, Settings, Workflow, type LucideIcon } from "lucide-react";

type View = "pipeline" | "inbox" | "broadcasts" | "automation" | "channels" | "settings";
type LeadStatus = string;
type PipelineStage = { id: string; title: string; color: "blue" | "violet" | "amber" | "green" | "red" | "cyan" | "pink" | "gray"; isWon: boolean };

type AutomationItem = {
  id: string;
  name: string;
  steps: Array<{ id: string; delayMinutes: number; message: string; messages: Record<string, string>; enabled: boolean; imageUrl?: string; buttons: Array<{ text: string; url: string }> }>;
  enabled: boolean;
};

type AutomationStepDraft = { id: string; delayMinutes: string; messages: Record<string, string>; activeLanguage: string; enabled: boolean; imageUrl?: string; uploading?: boolean; buttons: Array<{ id: string; text: string; url: string }> };

type Lead = {
  id: string;
  name: string;
  handle: string;
  language: string;
  source: "Telegram" | "WhatsApp";
  status: LeadStatus;
  message: string;
  updatedAt: string;
  unread?: number;
};

const defaultStages: PipelineStage[] = [
  { id: "new", title: "Новые", color: "blue", isWon: false },
  { id: "qualified", title: "Квалификация", color: "violet", isWon: false },
  { id: "dialogue", title: "В диалоге", color: "amber", isWon: false },
  { id: "won", title: "Сделка", color: "green", isWon: true },
];

const languages = [
  { id: "ru", name: "Русский", flag: "🇷🇺" },
  { id: "en", name: "English", flag: "🇬🇧" },
  { id: "es", name: "Español", flag: "🇪🇸" },
  { id: "zh", name: "中文", flag: "🇨🇳" },
  { id: "ar", name: "العربية", flag: "🇸🇦" },
  { id: "pt", name: "Português", flag: "🇵🇹" },
];

function emptyLanguageMessages() {
  return Object.fromEntries(languages.map((language) => [language.id, ""]));
}

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "pipeline", label: "Лиды", icon: Columns3 },
  { id: "inbox", label: "Диалоги", icon: MessagesSquare },
  { id: "broadcasts", label: "Рассылки", icon: Send },
  { id: "automation", label: "Автоцепочки", icon: Workflow },
  { id: "channels", label: "Каналы", icon: Cable },
  { id: "settings", label: "Настройки", icon: Settings },
];

export default function Home() {
  const [view, setView] = useState<View>("pipeline");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>(defaultStages);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [activeLanguage, setActiveLanguage] = useState("ru");
  const [drafts, setDrafts] = useState<Record<string, string>>({
    ru: "", en: "", es: "", zh: "", ar: "", pt: "",
  });
  const [sentToast, setSentToast] = useState("");
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/leads").then((response) => response.json()),
      fetch("/api/pipeline").then((response) => response.json()),
    ])
      .then(([leadData, pipelineData]: [{ leads?: Lead[] }, { stages?: PipelineStage[] }]) => {
        setLeads(leadData.leads ?? []);
        if (pipelineData.stages?.length) setStages(pipelineData.stages);
      })
      .catch(() => notify("Не удалось загрузить лидов"))
      .finally(() => setLoadingLeads(false));
  }, []);

  const wonStageIds = useMemo(() => new Set(stages.filter((stage) => stage.isWon).map((stage) => stage.id)), [stages]);
  const stats = useMemo(() => ({
    total: leads.length,
    active: leads.filter((lead) => !wonStageIds.has(lead.status)).length,
    unread: leads.reduce((sum, lead) => sum + (lead.unread || 0), 0),
    won: leads.filter((lead) => wonStageIds.has(lead.status)).length,
  }), [leads, wonStageIds]);

  function moveLead(id: string, status: LeadStatus) {
    setLeads((current) => current.map((lead) => (lead.id === id ? { ...lead, status } : lead)));
    fetch("/api/leads", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) })
      .then((response) => { if (!response.ok) throw new Error(); })
      .catch(() => notify("Не удалось сохранить новый этап"));
  }

  function insertFormatting(before: string, after = before) {
    const field = editorRef.current;
    if (!field) return;
    const value = drafts[activeLanguage];
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = value.slice(start, end) || "текст";
    setDrafts((current) => ({ ...current, [activeLanguage]: `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}` }));
    requestAnimationFrame(() => field.focus());
  }

  function notify(message: string) {
    setSentToast(message);
    window.setTimeout(() => setSentToast(""), 2600);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><Image className="brand-emblem" src="/emblem.svg" width={36} height={36} alt="ASCN.AI" priority /><span>ASCN.AI Agent</span></div>
        <div className="workspace-switcher">
          <div className="bot-avatar">S</div>
          <div><strong>Новый проект</strong><span>Панель управления</span></div>
        </div>

        <nav className="main-nav">
          <p>РАБОЧЕЕ ПРОСТРАНСТВО</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>
              <Icon className="nav-icon" aria-hidden="true" strokeWidth={1.8} />{item.label}
              {item.id === "inbox" && stats.unread > 0 && <b>{stats.unread}</b>}
            </button>;
          })}
        </nav>

      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumbs"><span>Новый проект</span><i>/</i><strong>{navItems.find((item) => item.id === view)?.label}</strong></div>
        </header>

        <div className="content">
          {view === "pipeline" && <Pipeline leads={leads} setLeads={setLeads} stages={stages} setStages={setStages} stats={stats} moveLead={moveLead} setView={setView} loading={loadingLeads} notify={notify} />}
          {view === "inbox" && <Inbox leads={leads} stages={stages} notify={notify} setView={setView} />}
          {view === "broadcasts" && (
            <Broadcasts
              activeLanguage={activeLanguage}
              setActiveLanguage={setActiveLanguage}
              drafts={drafts}
              setDrafts={setDrafts}
              editorRef={editorRef}
              insertFormatting={insertFormatting}
              notify={notify}
              leads={leads}
              stages={stages}
            />
          )}
          {view === "automation" && <Automation notify={notify} />}
          {view === "channels" && <Channels notify={notify} />}
          {view === "settings" && <NotificationSettingsView notify={notify} />}
        </div>
      </section>

      {sentToast && <div className="toast"><span>✓</span>{sentToast}</div>}
    </main>
  );
}

function PageHeader({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</div>;
}

function Pipeline({ leads, setLeads, stages, setStages, stats, moveLead, setView, loading, notify }: {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  stages: PipelineStage[];
  setStages: React.Dispatch<React.SetStateAction<PipelineStage[]>>;
  stats: { total: number; active: number; unread: number; won: number };
  moveLead: (id: string, status: LeadStatus) => void;
  setView: (view: View) => void;
  loading: boolean;
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("all");
  const [channel, setChannel] = useState("all");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftStages, setDraftStages] = useState<PipelineStage[]>(stages);
  const colors: Array<{ id: PipelineStage["color"]; title: string }> = [
    { id: "blue", title: "Синий" }, { id: "violet", title: "Фиолетовый" }, { id: "amber", title: "Оранжевый" }, { id: "green", title: "Зелёный" },
    { id: "red", title: "Красный" }, { id: "cyan", title: "Голубой" }, { id: "pink", title: "Розовый" }, { id: "gray", title: "Серый" },
  ];
  const visibleLeads = leads.filter((lead) => {
    const matchesQuery = `${lead.name} ${lead.handle}`.toLowerCase().includes(query.toLowerCase());
    const selectedLanguage = languages.find((item) => item.id === language);
    const matchesLanguage = language === "all" || lead.language.toLowerCase().split(/[-_]/)[0] === language || lead.language === selectedLanguage?.name;
    const matchesChannel = channel === "all" || lead.source === channel;
    return matchesQuery && matchesLanguage && matchesChannel;
  });

  function openEditor() {
    setDraftStages(stages.map((stage) => ({ ...stage })));
    setEditing(true);
  }

  function updateDraft(id: string, changes: Partial<PipelineStage>) {
    setDraftStages((current) => current.map((stage) => stage.id === id ? { ...stage, ...changes } : stage));
  }

  function setFinalStage(id: string) {
    setDraftStages((current) => current.map((stage) => ({ ...stage, isWon: stage.id === id })));
  }

  function moveDraft(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draftStages.length) return;
    setDraftStages((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function removeDraft(id: string) {
    if (draftStages.length === 1) return notify("В воронке должен остаться хотя бы один этап");
    setDraftStages((current) => {
      const removed = current.find((stage) => stage.id === id);
      const next = current.filter((stage) => stage.id !== id);
      if (removed?.isWon && next.length) next[next.length - 1] = { ...next[next.length - 1], isWon: true };
      return next;
    });
  }

  function addDraft() {
    if (draftStages.length >= 8) return notify("Можно создать не больше восьми этапов");
    setDraftStages((current) => [...current, { id: `stage-${crypto.randomUUID()}`, title: "Новый этап", color: "gray", isWon: false }]);
  }

  async function saveStages() {
    if (draftStages.some((stage) => !stage.title.trim())) return notify("Назовите каждый этап");
    setSaving(true);
    const response = await fetch("/api/pipeline", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ stages: draftStages }) });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return notify(result.error || "Не удалось сохранить воронку");
    const saved = result.stages as PipelineStage[];
    const validIds = new Set(saved.map((stage) => stage.id));
    setStages(saved);
    setLeads((current) => current.map((lead) => validIds.has(lead.status) ? lead : { ...lead, status: saved[0].id }));
    setEditing(false);
    notify(result.moved ? `Воронка сохранена. Перенесено лидов: ${result.moved}` : "Воронка сохранена");
  }

  const finalStageTitle = stages.find((stage) => stage.isWon)?.title || "финальном этапе";
  return <>
    <PageHeader eyebrow="CRM ДЛЯ МЕССЕНДЖЕРОВ" title="Воронка лидов" text="Все, кто напишет подключённому боту, автоматически появятся здесь." action={<div className="pipeline-actions"><button className="ghost-button" onClick={openEditor}>⚙ Настроить воронку</button><button className="primary-button" onClick={() => setView(leads.length ? "broadcasts" : "channels")}>{leads.length ? "＋ Новая рассылка" : "Подключить канал"}</button></div>} />
    {editing && <section className="pipeline-editor">
      <header><div><h2>Настройка воронки</h2><p>Добавляйте этапы и меняйте их порядок. Лиды из удалённого этапа попадут в первый.</p></div><button aria-label="Закрыть настройку воронки" onClick={() => setEditing(false)}>×</button></header>
      <div className="pipeline-stage-list">
        {draftStages.map((stage, index) => <div className="pipeline-stage-row" key={stage.id}>
          <span className="stage-drag">{String(index + 1).padStart(2, "0")}</span>
          <label><span>Название</span><input aria-label={`Название этапа ${index + 1}`} maxLength={40} value={stage.title} onChange={(event) => updateDraft(stage.id, { title: event.target.value })} /></label>
          <label><span>Цвет</span><select aria-label={`Цвет этапа ${index + 1}`} value={stage.color} onChange={(event) => updateDraft(stage.id, { color: event.target.value as PipelineStage["color"] })}>{colors.map((color) => <option value={color.id} key={color.id}>{color.title}</option>)}</select></label>
          <label className="final-stage"><input type="radio" name="final-stage" checked={stage.isWon} onChange={() => setFinalStage(stage.id)} /><span>Финальный</span></label>
          <div className="stage-order"><button aria-label={`Поднять этап ${stage.title}`} disabled={index === 0} onClick={() => moveDraft(index, -1)}>↑</button><button aria-label={`Опустить этап ${stage.title}`} disabled={index === draftStages.length - 1} onClick={() => moveDraft(index, 1)}>↓</button></div>
          <button className="stage-delete" aria-label={`Удалить этап ${stage.title}`} disabled={draftStages.length === 1} onClick={() => removeDraft(stage.id)}>×</button>
        </div>)}
      </div>
      <div className="pipeline-editor-footer"><button className="add-stage-button" disabled={draftStages.length >= 8} onClick={addDraft}>＋ Добавить этап</button><div><button className="ghost-button" onClick={() => setEditing(false)}>Отмена</button><button className="primary-button" disabled={saving} onClick={() => void saveStages()}>{saving ? "Сохраняем…" : "Сохранить воронку"}</button></div></div>
    </section>}
    <div className="metric-row">
      <Metric label="Всего лидов" value={stats.total} note="за всё время" />
      <Metric label="Активные диалоги" value={stats.active} note="без завершённых сделок" />
      <Metric label="Новые сообщения" value={stats.unread} note="ожидают просмотра" />
      <Metric label="Завершённые сделки" value={stats.won} note={`в колонке «${finalStageTitle}»`} />
    </div>
    <div className="board-toolbar"><div className="search-box">⌕ <input aria-label="Поиск лидов" placeholder="Поиск по имени или username" value={query} onChange={(event) => setQuery(event.target.value)} /></div><select className="filter-button" aria-label="Фильтр по языку" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="all">Все языки</option>{languages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="filter-button" aria-label="Фильтр по каналу" value={channel} onChange={(event) => setChannel(event.target.value)}><option value="all">Все каналы</option><option>Telegram</option><option>WhatsApp</option></select></div>
    <div className="kanban" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(230px, 1fr))` }}>
      {stages.map((column) => {
        const items = visibleLeads.filter((lead) => lead.status === column.id);
        return <section className="kanban-column" key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => moveLead(event.dataTransfer.getData("lead"), column.id)}>
          <header><div><span className={`status-dot ${column.color}`} /><strong>{column.title}</strong><b>{items.length}</b></div></header>
          <div className="kanban-list">
            {items.map((lead) => <LeadCard key={lead.id} lead={lead} onDragStart={(event) => event.dataTransfer.setData("lead", lead.id)} />)}
            {items.length === 0 && <div className="empty-drop">{loading ? "Загрузка…" : leads.length ? "Перетащите лида сюда" : "Пока пусто"}</div>}
          </div>
        </section>;
      })}
    </div>
  </>;
}

function Metric({ label, value, note }: { label: string; value: number | string; note: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function LeadCard({ lead, onDragStart }: { lead: Lead; onDragStart: React.DragEventHandler<HTMLElement> }) {
  return <article className="lead-card" draggable onDragStart={onDragStart}>
    <div className="lead-head"><div className="lead-avatar">{lead.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div><div><strong>{lead.name}</strong><span>{lead.handle}</span></div></div>
    <p>{lead.message}</p>
    <div className="lead-tags"><span>{lead.language}</span><span className={lead.source === "Telegram" ? "telegram" : "whatsapp"}>{lead.source}</span></div>
    <footer><time>{new Date(lead.updatedAt).toLocaleString("ru-RU")}</time>{lead.unread ? <b>{lead.unread}</b> : null}</footer>
  </article>;
}

function Inbox({ leads, stages, notify, setView }: { leads: Lead[]; stages: PipelineStage[]; notify: (message: string) => void; setView: (view: View) => void }) {
  const [selected, setSelected] = useState("");
  const [conversationQuery, setConversationQuery] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<{ id: string; direction: "inbound" | "outbound"; text: string; createdAt: string }[]>([]);
  const activeLeadId = selected || leads[0]?.id || "";
  const lead = leads.find((item) => item.id === activeLeadId) || null;
  const visibleConversations = leads.filter((item) => `${item.name} ${item.handle} ${item.message}`.toLowerCase().includes(conversationQuery.toLowerCase()));

  useEffect(() => {
    if (!activeLeadId) return;
    fetch(`/api/leads/${encodeURIComponent(activeLeadId)}/messages`)
      .then((response) => response.json())
      .then((data) => setMessages(data.messages ?? []))
      .catch(() => setMessages([]));
  }, [activeLeadId]);

  if (!lead) return <><PageHeader eyebrow="ЕДИНЫЙ ИНБОКС" title="Диалоги" text="Telegram и WhatsApp в одном окне." /><EmptyState title="Диалогов пока нет" text="Подключите канал. Первый человек, который напишет боту, автоматически появится здесь." action="Подключить канал" onAction={() => setView("channels")} /></>;
  const leadId = lead.id;

  async function sendMessage() {
    const cleanMessage = message.trim();
    if (!cleanMessage) return;
    const response = await fetch("/api/messages/reply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leadId, text: cleanMessage }) });
    const result = await response.json();
    if (!response.ok) return notify(result.error || "Не удалось отправить сообщение");
    setMessages((current) => [...current, result.message]);
    setMessage("");
    notify("Сообщение отправлено");
  }
  return <>
    <PageHeader eyebrow="ЕДИНЫЙ ИНБОКС" title="Диалоги" text="Telegram и WhatsApp в одном окне — вместе с историей и статусом лида." />
    <div className="inbox-layout">
      <section className="conversation-list"><div className="conversation-search">⌕ <input aria-label="Поиск диалогов" placeholder="Найти диалог" value={conversationQuery} onChange={(event) => setConversationQuery(event.target.value)} /></div>{visibleConversations.map((item) => <button key={item.id} className={activeLeadId === item.id ? "selected" : ""} onClick={() => setSelected(item.id)}><span className="lead-avatar">{item.name[0]}</span><div><strong>{item.name}</strong><p>{item.message}</p></div><time>{new Date(item.updatedAt).toLocaleDateString("ru-RU")}</time>{item.unread ? <b>{item.unread}</b> : null}</button>)}</section>
      <section className="chat-panel"><header><div className="lead-avatar">{lead.name[0]}</div><div><strong>{lead.name}</strong><span>{lead.source}</span></div></header><div className="messages">{messages.map((item) => <div key={item.id} className={`bubble ${item.direction === "inbound" ? "incoming" : "outgoing"}`}>{item.text}<time>{new Date(item.createdAt).toLocaleString("ru-RU")}</time></div>)}</div><footer><input aria-label="Новое сообщение" placeholder="Напишите сообщение..." value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendMessage(); }} /><button className="send-button" aria-label="Отправить сообщение" onClick={sendMessage}>➤</button></footer></section>
      <aside className="contact-panel"><div className="lead-avatar large">{lead.name[0]}</div><h3>{lead.name}</h3><p>{lead.handle}</p><dl><div><dt>Язык</dt><dd>{lead.language}</dd></div><div><dt>Канал</dt><dd>{lead.source}</dd></div><div><dt>Этап</dt><dd>{stages.find((item) => item.id === lead.status)?.title || "Не указан"}</dd></div><div><dt>Последняя активность</dt><dd>{new Date(lead.updatedAt).toLocaleString("ru-RU")}</dd></div></dl></aside>
    </div>
  </>;
}

function Broadcasts({ activeLanguage, setActiveLanguage, drafts, setDrafts, editorRef, insertFormatting, notify, leads, stages }: {
  activeLanguage: string; setActiveLanguage: (id: string) => void; drafts: Record<string, string>; setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>; editorRef: React.RefObject<HTMLTextAreaElement | null>; insertFormatting: (before: string, after?: string) => void; notify: (message: string) => void; leads: Lead[]; stages: PipelineStage[];
}) {
  const active = languages.find((language) => language.id === activeLanguage)!;
  const [previewChannel, setPreviewChannel] = useState<"Telegram" | "WhatsApp">("Telegram");
  const [sending, setSending] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [buttons, setButtons] = useState<Array<{ id: string; text: string; url: string }>>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<"all" | "Telegram" | "WhatsApp">("all");
  const wonStageIds = new Set(stages.filter((stage) => stage.isWon).map((stage) => stage.id));
  const recipients = leads.filter((lead) => !wonStageIds.has(lead.status) && (statusFilter === "all" || lead.status === statusFilter) && (channelFilter === "all" || lead.source === channelFilter));
  const recipientCount = recipients.length;
  const hasMessage = Object.values(drafts).some((draft) => draft.trim());
  const previewText = drafts[activeLanguage].replace("{{first_name}}", "Имя").replace(/<[^>]+>/g, "");

  async function uploadImage(file?: File) {
    if (!file) return;
    setUploadingImage(true);
    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch("/api/uploads", { method: "POST", body: formData });
    const result = await response.json();
    setUploadingImage(false);
    if (!response.ok) return notify(result.error || "Не удалось загрузить фото");
    setImageUrl(result.url);
  }

  async function removeImage() {
    if (imageUrl) await fetch(imageUrl, { method: "DELETE" });
    setImageUrl("");
  }

  function addButton() {
    if (buttons.length < 3) setButtons((current) => [...current, { id: crypto.randomUUID(), text: "", url: "" }]);
  }

  function updateButton(id: string, changes: Partial<{ text: string; url: string }>) {
    setButtons((current) => current.map((button) => button.id === id ? { ...button, ...changes } : button));
  }

  async function sendBroadcast() {
    if (uploadingImage) return notify("Дождитесь загрузки фото");
    if (buttons.some((button) => !button.text.trim() || !/^https?:\/\//i.test(button.url.trim()))) return notify("Заполните текст и ссылку каждой кнопки");
    setSending(true);
    try {
      const response = await fetch("/api/broadcasts/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ drafts, status: statusFilter, channel: channelFilter, imageUrl: imageUrl || undefined, buttons: buttons.map(({ text, url }) => ({ text: text.trim(), url: url.trim() })) }) });
      const result = await response.json();
      notify(response.ok ? `Отправлено: ${result.sent}` : result.error || `Не отправлено: ${result.failed}`);
    } finally {
      setSending(false);
    }
  }
  return <>
    <PageHeader eyebrow="КАМПАНИИ" title="Новая рассылка" text="Одно сообщение — каждому получателю на его языке." />
    <div className="campaign-layout">
      <section className="campaign-card audience-card"><div className="section-number">1</div><div className="section-content"><h2>Кому отправляем</h2><p>Фильтры сразу меняют список получателей.</p><div className="form-grid"><label>Этап воронки<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Все активные лиды</option>{stages.filter((stage) => !stage.isWon).map((stage) => <option value={stage.id} key={stage.id}>{stage.title}</option>)}</select></label><label>Канал<select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value as "all" | "Telegram" | "WhatsApp")}><option value="all">Telegram и WhatsApp</option><option value="Telegram">Только Telegram</option><option value="WhatsApp">Только WhatsApp</option></select></label></div><div className="audience-summary"><strong>{recipientCount} получателей</strong><span>{recipientCount ? "подходят под выбранные фильтры" : "нет подходящих лидов"}</span></div></div></section>
      <section className="campaign-card editor-card"><div className="section-number">2</div><div className="section-content"><h2>Сообщение</h2><p>Переключайтесь между языками — получатель увидит свою версию.</p><div className="language-tabs">{languages.map((language) => <button key={language.id} className={activeLanguage === language.id ? "active" : ""} onClick={() => setActiveLanguage(language.id)}>{language.flag} {language.name}</button>)}</div><div className="editor"><div className="editor-toolbar"><button aria-label="Жирный текст" onClick={() => insertFormatting("<b>", "</b>")}>B</button><button aria-label="Курсив" className="italic" onClick={() => insertFormatting("<i>", "</i>")}>I</button><button aria-label="Подчеркнутый текст" onClick={() => insertFormatting("<u>", "</u>")}>U</button><i /><button aria-label="Ссылка" onClick={() => insertFormatting("<a href=\"https://\">", "</a>")}>🔗</button><button aria-label="Имя получателя" onClick={() => insertFormatting("{{first_name}}", "")}>{"{}"}</button><button aria-label="Эмодзи" onClick={() => insertFormatting("😊", "")}>☺</button></div><textarea ref={editorRef} placeholder="Напишите сообщение…" value={drafts[activeLanguage]} onChange={(event) => setDrafts((current) => ({ ...current, [activeLanguage]: event.target.value }))} aria-label={`Текст рассылки на языке ${active.name}`} /><footer><span>{drafts[activeLanguage].length} символов</span><span>Переменная: {"{{first_name}}"}</span></footer></div><div className="broadcast-media"><div className="broadcast-option-head"><div><strong>Фото</strong><span>Одно изображение для всех языков</span></div>{!imageUrl && <label className={uploadingImage ? "uploading" : ""}>{uploadingImage ? "Загружаем…" : "＋ Добавить фото"}<input aria-label="Фото для рассылки" type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploadingImage} onChange={(event) => void uploadImage(event.target.files?.[0])} /></label>}</div>{imageUrl && <div className="broadcast-image"><Image src={imageUrl} alt="Фото для рассылки" fill unoptimized /><button aria-label="Удалить фото из рассылки" onClick={() => void removeImage()}>×</button></div>}</div><div className="broadcast-cta"><div className="broadcast-option-head"><div><strong>CTA-кнопки</strong><span>До трёх кнопок под сообщением</span></div>{buttons.length < 3 && <button onClick={addButton}>＋ Добавить кнопку</button>}</div>{buttons.map((button, index) => <div className="cta-row" key={button.id}><span>{index + 1}</span><input aria-label={`Текст CTA-кнопки ${index + 1}`} placeholder="Узнать подробнее" value={button.text} onChange={(event) => updateButton(button.id, { text: event.target.value })} /><input aria-label={`Ссылка CTA-кнопки ${index + 1}`} placeholder="https://example.com" value={button.url} onChange={(event) => updateButton(button.id, { url: event.target.value })} /><button aria-label={`Удалить CTA-кнопку ${index + 1}`} onClick={() => setButtons((current) => current.filter((item) => item.id !== button.id))}>×</button></div>)}</div></div></section>
      <aside className="preview-card"><header><span>Предпросмотр</span><div><button aria-label="Предпросмотр Telegram" className={previewChannel === "Telegram" ? "active" : ""} onClick={() => setPreviewChannel("Telegram")}>✈</button><button aria-label="Предпросмотр WhatsApp" className={previewChannel === "WhatsApp" ? "active" : ""} onClick={() => setPreviewChannel("WhatsApp")}>◉</button></div></header><div className="phone"><div className="phone-top"><span>9:41</span><span>● ● ▰</span></div><div className="telegram-head"><span className="preview-back">‹</span><div className="bot-avatar">Б</div><div><strong>Ваш бот</strong><span>{previewChannel === "Telegram" ? "бот" : "WhatsApp Business"}</span></div></div><div className="phone-chat">{drafts[activeLanguage] || imageUrl ? <div className="preview-bubble">{imageUrl && <div className="preview-uploaded-image"><Image src={imageUrl} alt="Превью фото" fill unoptimized /></div>}{previewText && <p>{previewText}</p>}<time>сейчас ✓</time>{buttons.filter((button) => button.text.trim()).length > 0 && <div className="preview-buttons">{buttons.filter((button) => button.text.trim()).map((button) => <span key={button.id}>{button.text}</span>)}</div>}</div> : <div className="preview-placeholder">Сообщение появится здесь</div>}</div></div><div className="preview-language">{active.flag} {active.name} · {previewChannel}</div></aside>
    </div>
    <div className="send-bar"><div><strong>{recipientCount ? "Проверьте сообщение" : "Нет получателей"}</strong><span>{recipientCount} получателей · {channelFilter === "all" ? "Telegram + WhatsApp" : channelFilter}</span></div><button className="primary-button large" disabled={sending || !recipientCount || !hasMessage} onClick={sendBroadcast}>{sending ? "Отправляем…" : "Отправить рассылку"} →</button></div>
  </>;
}

function Automation({ notify }: { notify: (message: string) => void }) {
  const [items, setItems] = useState<AutomationItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<AutomationStepDraft[]>([{ id: "step-1", delayMinutes: "10", messages: emptyLanguageMessages(), activeLanguage: "ru", enabled: true, buttons: [] }]);

  useEffect(() => {
    fetch("/api/automations")
      .then((response) => response.json())
      .then((data: { automations?: AutomationItem[] }) => setItems(data.automations ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  async function saveAutomation() {
    const invalidButton = steps.some((step) => step.buttons.some((button) => !button.text.trim() || !/^https?:\/\//i.test(button.url.trim())));
    const invalidStep = steps.some((step) => !Object.values(step.messages).some((message) => message.trim()) || step.uploading || Number(step.delayMinutes) < 0 || !Number.isFinite(Number(step.delayMinutes)));
    if (!name.trim() || invalidButton || invalidStep) return notify("Заполните название, сообщения и ссылки кнопок");
    setSaving(true);
    const response = await fetch("/api/automations", { method: editingId ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: editingId || undefined, name, steps: steps.map((step) => ({ id: step.id, delayMinutes: Number(step.delayMinutes), messages: step.messages, enabled: step.enabled, imageUrl: step.imageUrl, buttons: step.buttons.map(({ text, url }) => ({ text, url })) })) }) });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return notify(result.error || "Не удалось сохранить сценарий");
    setItems((current) => editingId ? current.map((item) => item.id === editingId ? result.automation : item) : [...current, result.automation]);
    closeEditor();
    notify(editingId ? "Автоцепочка обновлена" : "Автоцепочка включена");
  }

  function startNew() {
    setEditingId("");
    setName("");
    setSteps([{ id: crypto.randomUUID(), delayMinutes: "10", messages: emptyLanguageMessages(), activeLanguage: "ru", enabled: true, buttons: [] }]);
    setEditing(true);
  }

  function startEdit(item: AutomationItem) {
    setEditingId(item.id);
    setName(item.name);
    setSteps(item.steps.map((step) => ({
      id: step.id,
      delayMinutes: String(step.delayMinutes),
      messages: { ...emptyLanguageMessages(), ...(step.messages || { ru: step.message }) },
      activeLanguage: step.messages?.ru || step.message ? "ru" : Object.keys(step.messages || {}).find((language) => step.messages[language]) || "ru",
      enabled: step.enabled ?? true,
      imageUrl: step.imageUrl,
      buttons: step.buttons.map((button) => ({ id: crypto.randomUUID(), ...button })),
    })));
    setEditing(true);
  }

  function closeEditor() {
    setEditing(false);
    setEditingId("");
    setName("");
    setSteps([{ id: crypto.randomUUID(), delayMinutes: "10", messages: emptyLanguageMessages(), activeLanguage: "ru", enabled: true, buttons: [] }]);
  }

  function updateStep(id: string, changes: Partial<AutomationStepDraft>) {
    setSteps((current) => current.map((step) => step.id === id ? { ...step, ...changes } : step));
  }

  function addStep() {
    setSteps((current) => [...current, { id: crypto.randomUUID(), delayMinutes: "60", messages: emptyLanguageMessages(), activeLanguage: "ru", enabled: true, buttons: [] }]);
  }

  async function uploadStepImage(stepId: string, file?: File) {
    if (!file) return;
    updateStep(stepId, { uploading: true });
    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch("/api/uploads", { method: "POST", body: formData });
    const result = await response.json();
    if (!response.ok) {
      updateStep(stepId, { uploading: false });
      return notify(result.error || "Не удалось загрузить фото");
    }
    updateStep(stepId, { uploading: false, imageUrl: result.url });
  }

  async function removeStepImage(stepId: string, imageUrl: string) {
    await fetch(imageUrl, { method: "DELETE" });
    updateStep(stepId, { imageUrl: undefined });
  }

  function addStepButton(stepId: string) {
    setSteps((current) => current.map((step) => step.id === stepId && step.buttons.length < 3 ? { ...step, buttons: [...step.buttons, { id: crypto.randomUUID(), text: "", url: "" }] } : step));
  }

  function updateStepButton(stepId: string, buttonId: string, changes: Partial<{ text: string; url: string }>) {
    setSteps((current) => current.map((step) => step.id === stepId ? { ...step, buttons: step.buttons.map((button) => button.id === buttonId ? { ...button, ...changes } : button) } : step));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setSteps((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function toggleAutomation(item: AutomationItem) {
    const response = await fetch("/api/automations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, enabled: !item.enabled }) });
    if (!response.ok) return notify("Не удалось изменить сценарий");
    setItems((current) => current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, enabled: !item.enabled } : currentItem));
  }

  async function toggleStep(item: AutomationItem, stepId: string, enabled: boolean) {
    const response = await fetch("/api/automations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, stepId, stepEnabled: enabled }) });
    const result = await response.json();
    if (!response.ok) return notify(result.error || "Не удалось изменить шаг");
    setItems((current) => current.map((currentItem) => currentItem.id === item.id ? result.automation : currentItem));
  }

  async function removeAutomation(id: string) {
    const response = await fetch(`/api/automations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) return notify("Не удалось удалить сценарий");
    setItems((current) => current.filter((item) => item.id !== id));
    notify("Автоцепочка удалена");
  }

  function delayLabel(minutes: number) {
    if (minutes === 0) return "сразу";
    if (minutes % 1440 === 0) return `${minutes / 1440} дн.`;
    if (minutes % 60 === 0) return `${minutes / 60} ч.`;
    return `${minutes} мин.`;
  }

  function stepText(step: AutomationItem["steps"][number]) {
    return step.messages?.ru || Object.values(step.messages || {}).find(Boolean) || step.message;
  }

  return <>
    <PageHeader eyebrow="АВТОМАТИЗАЦИЯ" title="Автоцепочки" text="Создавайте последовательности сообщений. Новое входящее сообщение от клиента останавливает оставшиеся шаги." action={<button className="primary-button" onClick={startNew}>＋ Новая автоцепочка</button>} />
    {editing && <section className="automation-editor">
      <div className="automation-editor-head"><div><span className="section-number">↗</span><div><h2>{editingId ? "Редактирование автоцепочки" : "Новая автоцепочка"}</h2><p>Шаги отправляются сверху вниз, пока клиент не ответит.</p></div></div><button aria-label="Закрыть редактор" onClick={closeEditor}>×</button></div>
      <label className="automation-name">Название<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, прогрев нового лида" /></label>
      <div className="automation-steps">{steps.map((step, index) => <article key={step.id}>
        <div className="step-rail"><span>{index + 1}</span>{index < steps.length - 1 && <i />}</div>
        <div className="step-body">
          <header><div><strong>Сообщение {index + 1}</strong><small>{index === 0 ? "После первого обращения" : "Если клиент не ответил"}</small></div><div className="step-head-controls"><label className="switch small" aria-label={`${step.enabled ? "Выключить" : "Включить"} сообщение ${index + 1}`}><input type="checkbox" checked={step.enabled} onChange={() => updateStep(step.id, { enabled: !step.enabled })} /><span /></label><div className="step-actions"><button aria-label={`Поднять сообщение ${index + 1}`} disabled={index === 0} onClick={() => moveStep(index, -1)}>↑</button><button aria-label={`Опустить сообщение ${index + 1}`} disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)}>↓</button>{steps.length > 1 && <button aria-label={`Удалить сообщение ${index + 1}`} onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))}>×</button>}</div></div></header>
          <label className="step-delay">Отправить через <input type="number" min="0" value={step.delayMinutes} onChange={(event) => updateStep(step.id, { delayMinutes: event.target.value })} /> минут</label>
          <div className="step-language-tabs">{languages.map((language) => <button key={language.id} className={step.activeLanguage === language.id ? "active" : ""} aria-label={`${language.name}, сообщение ${index + 1}`} onClick={() => updateStep(step.id, { activeLanguage: language.id })}>{language.flag} {language.name}{step.messages[language.id]?.trim() && <i />}</button>)}</div>
          <textarea aria-label={`Текст сообщения ${index + 1} на языке ${languages.find((language) => language.id === step.activeLanguage)?.name}`} value={step.messages[step.activeLanguage] || ""} onChange={(event) => updateStep(step.id, { messages: { ...step.messages, [step.activeLanguage]: event.target.value } })} placeholder="Напишите текст сообщения…" />
          <small>Если перевод пустой, отправится русская версия. Переменная <b>{"{{first_name}}"}</b> подставит имя клиента.</small>
          <div className="step-media">
            <div className="step-extra-head"><div><strong>Фото</strong><small>JPG, PNG, WEBP или GIF до 10 МБ</small></div>{!step.imageUrl && <label className={step.uploading ? "uploading" : ""}>{step.uploading ? "Загружаем…" : "＋ Добавить фото"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={step.uploading} onChange={(event) => void uploadStepImage(step.id, event.target.files?.[0])} /></label>}</div>
            {step.imageUrl && <div className="step-image-preview"><Image src={step.imageUrl} alt={`Фото для сообщения ${index + 1}`} width={180} height={110} unoptimized /><button aria-label={`Удалить фото сообщения ${index + 1}`} onClick={() => void removeStepImage(step.id, step.imageUrl!)}>×</button></div>}
          </div>
          <div className="step-cta">
            <div className="step-extra-head"><div><strong>CTA-кнопки</strong><small>До трёх кнопок под сообщением</small></div>{step.buttons.length < 3 && <button onClick={() => addStepButton(step.id)}>＋ Добавить кнопку</button>}</div>
            {step.buttons.map((button, buttonIndex) => <div className="cta-row" key={button.id}><span>{buttonIndex + 1}</span><input aria-label={`Текст кнопки ${buttonIndex + 1} сообщения ${index + 1}`} value={button.text} onChange={(event) => updateStepButton(step.id, button.id, { text: event.target.value })} placeholder="Узнать подробнее" /><input aria-label={`Ссылка кнопки ${buttonIndex + 1} сообщения ${index + 1}`} value={button.url} onChange={(event) => updateStepButton(step.id, button.id, { url: event.target.value })} placeholder="https://example.com" /><button aria-label={`Удалить кнопку ${buttonIndex + 1} сообщения ${index + 1}`} onClick={() => updateStep(step.id, { buttons: step.buttons.filter((item) => item.id !== button.id) })}>×</button></div>)}
          </div>
        </div>
      </article>)}</div>
      <button className="add-step-button" onClick={addStep}>＋ Добавить следующее сообщение</button>
      <footer><button className="ghost-button" onClick={closeEditor}>Отмена</button><button className="primary-button" disabled={saving} onClick={saveAutomation}>{saving ? "Сохраняем…" : editingId ? "Сохранить изменения" : "Сохранить и включить"}</button></footer>
    </section>}
    {!editing && !loading && items.length === 0 && <EmptyState title="Автоцепочек пока нет" text="Создайте сценарий из двух или нескольких сообщений с отдельной задержкой для каждого шага." action="Создать автоцепочку" onAction={startNew} />}
    {!editing && items.length > 0 && <div className="automation-overviews">{items.map((item) => <section className="automation-overview" key={item.id}>
      <header className="automation-overview-head"><div><div><h2>{item.name}</h2><span className={item.enabled ? "automation-status active" : "automation-status"}>{item.enabled ? "Включена" : "Выключена"}</span></div><p>Следующий шаг отправляется, только если клиент не ответил.</p></div><div><button className="ghost-button" onClick={() => startEdit(item)}>Изменить цепочку</button><button className="ghost-button danger" aria-label={`Удалить ${item.name}`} onClick={() => removeAutomation(item.id)}>Удалить</button><button className="ghost-button" onClick={() => toggleAutomation(item)}>{item.enabled ? "Выключить" : "Включить"}</button></div></header>
      <div className="automation-table-wrap"><div className="automation-steps-table"><div className="automation-table-head"><span>Шаг</span><span>Сообщение</span><span>Через</span><span>Условие</span><span>Языки</span><span>Статус</span><span /></div>{item.steps.map((step, index) => <div className="automation-table-row" key={step.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{stepText(step)}</strong><span>{delayLabel(step.delayMinutes)}</span><span>если не ответил</span><span className="automation-languages">{languages.filter((language) => step.messages?.[language.id]?.trim()).map((language) => <i key={language.id} title={language.name}>{language.flag}</i>)}</span><label className="switch small" aria-label={`${step.enabled ? "Выключить" : "Включить"} шаг ${index + 1}`}><input type="checkbox" checked={step.enabled} onChange={() => toggleStep(item, step.id, !step.enabled)} /><span /></label><button className="table-edit-button" onClick={() => startEdit(item)}>Изменить</button></div>)}</div></div>
    </section>)}</div>}
  </>;
}

type ChannelStatus = { telegram: boolean; telegramBotUsername?: string; telegramBotName?: string; whatsapp: boolean; whatsappPhoneNumber?: string; whatsappVerifiedName?: string };
type WhatsAppSetupInfo = { connected?: boolean; displayPhoneNumber?: string; verifiedName?: string; webhookUrl?: string; verifyToken?: string };

function Channels({ notify }: { notify: (message: string) => void }) {
  const [status, setStatus] = useState<ChannelStatus>({ telegram: false, whatsapp: false });
  const [setup, setSetup] = useState<"telegram" | "whatsapp" | "">("");
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [whatsapp, setWhatsApp] = useState({ accessToken: "", phoneNumberId: "", apiVersion: "", appSecret: "" });
  const [whatsappInfo, setWhatsAppInfo] = useState<WhatsAppSetupInfo>({});

  const loadStatus = () => fetch("/api/channels/status").then((response) => response.json()).then(setStatus).catch(() => setStatus({ telegram: false, whatsapp: false }));
  useEffect(() => { void loadStatus(); }, []);

  async function connectTelegram() {
    if (!token.trim()) return notify("Вставьте токен от BotFather");
    setConnecting(true);
    const response = await fetch("/api/channels/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    const result = await response.json();
    setConnecting(false);
    if (!response.ok) return notify(result.error || "Не удалось подключить бота");
    setToken("");
    await loadStatus();
    notify(result.webhookConfigured ? "Telegram-бот подключён" : "Бот проверен. Получение сообщений включится после публикации на HTTPS");
  }

  async function disconnectTelegram() {
    const response = await fetch("/api/channels/telegram", { method: "DELETE" });
    if (!response.ok) return notify("Не удалось отключить бота");
    await loadStatus();
    setSetup("");
    notify("Telegram-бот отключён");
  }

  async function openWhatsAppSetup() {
    const info = await fetch("/api/channels/whatsapp").then((response) => response.json()).catch(() => ({}));
    setWhatsAppInfo(info);
    setSetup("whatsapp");
  }

  async function connectWhatsApp() {
    if (!whatsapp.accessToken.trim() || !whatsapp.phoneNumberId.trim() || !whatsapp.apiVersion.trim() || !whatsapp.appSecret.trim()) return notify("Заполните все поля WhatsApp");
    setConnecting(true);
    const response = await fetch("/api/channels/whatsapp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(whatsapp) });
    const result = await response.json();
    setConnecting(false);
    if (!response.ok) return notify(result.error || "Не удалось подключить WhatsApp");
    setWhatsApp({ accessToken: "", phoneNumberId: "", apiVersion: "", appSecret: "" });
    setWhatsAppInfo(result);
    await loadStatus();
    notify("WhatsApp Business подключён");
  }

  async function disconnectWhatsApp() {
    const response = await fetch("/api/channels/whatsapp", { method: "DELETE" });
    if (!response.ok) return notify("Не удалось отключить WhatsApp");
    await loadStatus();
    setSetup("");
    setWhatsAppInfo({});
    notify("WhatsApp Business отключён");
  }

  return <>
    <PageHeader eyebrow="ИНТЕГРАЦИИ" title="Каналы" text="Подключите бота один раз — новые обращения появятся в лидах, а рассылки будут уходить из этого кабинета." />
    <div className="channel-grid">
      <ChannelCard name="Telegram" logo="/telegram-logo.svg" connected={status.telegram} detail={status.telegramBotUsername ? `@${status.telegramBotUsername}` : undefined} onConnect={() => setSetup("telegram")} />
      <ChannelCard name="WhatsApp Business" logo="/whatsapp-logo.svg" connected={status.whatsapp} detail={status.whatsappPhoneNumber || status.whatsappVerifiedName} onConnect={() => void openWhatsAppSetup()} />
    </div>
    {setup === "telegram" && <section className="telegram-setup">
      <header><div><Image src="/telegram-logo.svg" alt="Telegram" width={44} height={44} /><div><span>ПОДКЛЮЧЕНИЕ КАНАЛА</span><h2>{status.telegram ? "Настройка Telegram-бота" : "Подключите Telegram-бота"}</h2></div></div><button aria-label="Закрыть подключение" onClick={() => setSetup("")}>×</button></header>
      <form className="telegram-connect-form" onSubmit={(event) => { event.preventDefault(); void connectTelegram(); }}>
        {status.telegram && <div className="connected-bot"><span>✓</span><div><strong>{status.telegramBotName || "Telegram-бот подключён"}</strong><p>{status.telegramBotUsername ? `@${status.telegramBotUsername}` : "Бот готов отправлять сообщения"}</p></div></div>}
        <div className="setup-steps"><span>1</span><p>Откройте <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>, создайте бота командой <b>/newbot</b> и скопируйте токен.</p></div>
        <label className="token-field"><span>Токен бота</span><input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="123456789:AA..." /><small>Токен хранится только на вашем сервере и не показывается повторно.</small></label>
        <footer><button type="submit" className="primary-button" disabled={connecting}>{connecting ? "Проверяем бота…" : status.telegram ? "Подключить другой токен" : "Проверить и подключить"}</button>{status.telegram && <button type="button" className="danger-button" onClick={disconnectTelegram}>Отключить бота</button>}</footer>
      </form>
    </section>}
    {setup === "whatsapp" && <section className="telegram-setup whatsapp-setup">
      <header><div><Image src="/whatsapp-logo.svg" alt="WhatsApp Business" width={44} height={44} /><div><span>ПОДКЛЮЧЕНИЕ КАНАЛА</span><h2>{status.whatsapp ? "Настройка WhatsApp Business" : "Подключите WhatsApp Business"}</h2></div></div><button aria-label="Закрыть подключение" onClick={() => setSetup("")}>×</button></header>
      <form className="telegram-connect-form" onSubmit={(event) => { event.preventDefault(); void connectWhatsApp(); }}>
        {status.whatsapp && <div className="connected-bot"><span>✓</span><div><strong>{whatsappInfo.verifiedName || status.whatsappVerifiedName || "WhatsApp Business подключён"}</strong><p>{whatsappInfo.displayPhoneNumber || status.whatsappPhoneNumber || "Канал готов отправлять сообщения"}</p></div></div>}
        <div className="setup-steps"><span>1</span><p>Возьмите данные в Meta for Developers → WhatsApp → API Setup. Сервис проверит номер до сохранения.</p></div>
        <div className="whatsapp-fields">
          <label className="token-field"><span>Временный или постоянный access token</span><input type="password" autoComplete="off" value={whatsapp.accessToken} onChange={(event) => setWhatsApp((current) => ({ ...current, accessToken: event.target.value }))} placeholder="EAA..." /></label>
          <label className="token-field"><span>Phone number ID</span><input value={whatsapp.phoneNumberId} onChange={(event) => setWhatsApp((current) => ({ ...current, phoneNumberId: event.target.value }))} placeholder="123456789012345" /></label>
          <label className="token-field"><span>Версия Graph API</span><input value={whatsapp.apiVersion} onChange={(event) => setWhatsApp((current) => ({ ...current, apiVersion: event.target.value }))} placeholder="Например, v23.0" /></label>
          <label className="token-field"><span>App secret</span><input type="password" autoComplete="off" value={whatsapp.appSecret} onChange={(event) => setWhatsApp((current) => ({ ...current, appSecret: event.target.value }))} placeholder="Секрет приложения Meta" /></label>
        </div>
        {whatsappInfo.webhookUrl && whatsappInfo.verifyToken && <div className="webhook-details"><strong>Данные для Webhooks в Meta</strong><label>Callback URL<code>{whatsappInfo.webhookUrl}</code></label><label>Verify token<code>{whatsappInfo.verifyToken}</code></label></div>}
        <footer><button type="submit" className="primary-button" disabled={connecting}>{connecting ? "Проверяем номер…" : status.whatsapp ? "Подключить другие данные" : "Проверить и подключить"}</button>{status.whatsapp && <button type="button" className="danger-button" onClick={disconnectWhatsApp}>Отключить канал</button>}</footer>
      </form>
    </section>}
    <div className="settings-card"><div><span className="settings-icon">♢</span><div><h3>Всё на вашем сервере</h3><p>Токен и сообщения сохраняются внутри вашего проекта. Пользователю не нужно редактировать файлы настроек.</p></div></div></div>
  </>;
}

function ChannelCard({ name, logo, connected, detail, onConnect }: { name: string; logo: string; connected: boolean; detail?: string; onConnect: () => void }) {
  return <article className={`channel-card ${connected ? "connected" : ""}`}><Image className="channel-logo" src={logo} alt={`Логотип ${name}`} width={48} height={48} /><div className="channel-title"><div><h3>{name}</h3><span className={connected ? "" : "not-connected"}>{connected ? "Подключено" : "Не подключено"}</span></div></div><p>{connected ? `${detail || "Канал готов"} — можно получать обращения и отправлять сообщения.` : "Подключите канал прямо из кабинета без редактирования файлов."}</p><footer><button onClick={onConnect}>{connected ? "Настроить" : "Подключить"}</button></footer></article>;
}

type NotificationSettingsState = { operatorChatIds: string; summaryChatId: string; summaryTime: string; timeZone: string };

function NotificationSettingsView({ notify }: { notify: (message: string) => void }) {
  const browserTimeZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Europe/Moscow";
  const [settings, setSettings] = useState<NotificationSettingsState>({ operatorChatIds: "", summaryChatId: "", summaryTime: "20:00", timeZone: browserTimeZone });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch("/api/settings/notifications")
      .then((response) => response.json())
      .then((data: Partial<NotificationSettingsState>) => setSettings((current) => ({ ...current, ...data })))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function save(showNotice = true) {
    setSaving(true);
    const response = await fetch("/api/settings/notifications", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      notify(result.error || "Не удалось сохранить настройки");
      return false;
    }
    setSettings((current) => ({ ...current, ...result }));
    if (showNotice) notify("Настройки сохранены");
    return true;
  }

  async function sendTest() {
    if (!(await save(false))) return;
    setTesting(true);
    const response = await fetch("/api/settings/notifications", { method: "POST" });
    const result = await response.json();
    setTesting(false);
    notify(response.ok ? "Тестовое уведомление отправлено" : result.error || "Не удалось отправить тест");
  }

  return <>
    <PageHeader eyebrow="УВЕДОМЛЕНИЯ" title="Настройки" text="Куда отправлять новые обращения и ежедневную сводку команды." />
    <div className="notification-settings">
      <section className="notification-card">
        <div className="notification-card-title"><span>🔔</span><div><h2>Уведомления оператору</h2><p>Бот сразу напишет оператору, когда клиент отправит новое сообщение в Telegram или WhatsApp.</p></div></div>
        <label className="settings-field"><span>Telegram ID оператора или канала</span><input disabled={loading} value={settings.operatorChatIds} onChange={(event) => setSettings((current) => ({ ...current, operatorChatIds: event.target.value }))} placeholder="Например: 496902572, -1004364536438" /><small>Можно указать несколько ID через запятую. Оператор должен один раз нажать <b>/start</b> у подключённого бота.</small></label>
        <button className="ghost-button settings-test" disabled={loading || testing || saving || !settings.operatorChatIds.trim()} onClick={() => void sendTest()}>{testing ? "Отправляем…" : "Отправить тест"}</button>
      </section>
      <section className="notification-card">
        <div className="notification-card-title"><span>💬</span><div><h2>Ежедневная сводка</h2><p>Раз в день бот пришлёт количество обращений, сообщений, непрочитанных лидов и сделок.</p></div></div>
        <div className="summary-settings-grid">
          <label className="settings-field"><span>ID отдельного чата или канала</span><input disabled={loading} value={settings.summaryChatId} onChange={(event) => setSettings((current) => ({ ...current, summaryChatId: event.target.value }))} placeholder="Например: -1003832265865" /><small>Оставьте пустым — сводка придёт операторам из блока выше.</small></label>
          <label className="settings-field"><span>Время отправки</span><input type="time" disabled={loading} value={settings.summaryTime} onChange={(event) => setSettings((current) => ({ ...current, summaryTime: event.target.value }))} /></label>
          <label className="settings-field"><span>Часовой пояс</span><select disabled={loading} value={settings.timeZone} onChange={(event) => setSettings((current) => ({ ...current, timeZone: event.target.value }))}>{Array.from(new Set([browserTimeZone, "Europe/Moscow", "Europe/Saratov", "Asia/Dubai", "Asia/Shanghai", "UTC"])).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        </div>
      </section>
      <div className="settings-save-bar"><span>Все настройки хранятся на вашем сервере.</span><button className="primary-button" disabled={loading || saving} onClick={() => void save()}>{saving ? "Сохраняем…" : "Сохранить настройки"}</button></div>
    </div>
  </>;
}

function EmptyState({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return <section className="empty-state"><div className="add-circle">＋</div><h2>{title}</h2><p>{text}</p><button className="primary-button" onClick={onAction}>{action}</button></section>;
}
