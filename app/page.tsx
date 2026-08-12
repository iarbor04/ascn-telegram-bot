"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";

type View = "pipeline" | "inbox" | "broadcasts" | "automation" | "channels";
type LeadStatus = "new" | "qualified" | "dialogue" | "won";

type Lead = {
  id: number;
  name: string;
  handle: string;
  language: string;
  flag: string;
  source: "Telegram" | "WhatsApp";
  status: LeadStatus;
  message: string;
  time: string;
  unread?: number;
  value?: string;
};

const initialLeads: Lead[] = [
  { id: 1, name: "Алексей Орлов", handle: "@alexorlov", language: "Русский", flag: "🇷🇺", source: "Telegram", status: "new", message: "Хочу подключить бота для отдела продаж", time: "2 мин", unread: 2 },
  { id: 2, name: "Sophia Clark", handle: "@sophiaclark", language: "English", flag: "🇬🇧", source: "Telegram", status: "new", message: "Can I connect it to our CRM?", time: "8 мин", unread: 1 },
  { id: 3, name: "Daniel Ruiz", handle: "+34 612 88 21", language: "Español", flag: "🇪🇸", source: "WhatsApp", status: "qualified", message: "We need a demo for our team", time: "24 мин", value: "$390" },
  { id: 4, name: "Анна Лебедева", handle: "@annaleb", language: "Русский", flag: "🇷🇺", source: "Telegram", status: "qualified", message: "Подскажите по тарифу для агентства", time: "41 мин", value: "$590" },
  { id: 5, name: "Omar Khalid", handle: "@omar_k", language: "العربية", flag: "🇸🇦", source: "Telegram", status: "dialogue", message: "Need help with the integration", time: "1 ч", unread: 3, value: "$290" },
  { id: 6, name: "Mia Chen", handle: "+86 136 4301", language: "中文", flag: "🇨🇳", source: "WhatsApp", status: "dialogue", message: "Can we start next week?", time: "3 ч", value: "$790" },
  { id: 7, name: "Илья Волков", handle: "@ivolkov", language: "Русский", flag: "🇷🇺", source: "Telegram", status: "won", message: "Оплатил, спасибо!", time: "вчера", value: "$490" },
];

const columns: { id: LeadStatus; title: string; dot: string }[] = [
  { id: "new", title: "Новые", dot: "blue" },
  { id: "qualified", title: "Квалификация", dot: "violet" },
  { id: "dialogue", title: "В диалоге", dot: "amber" },
  { id: "won", title: "Сделка", dot: "green" },
];

const languages = [
  { id: "ru", name: "Русский", flag: "🇷🇺", count: 19 },
  { id: "en", name: "English", flag: "🇬🇧", count: 12 },
  { id: "es", name: "Español", flag: "🇪🇸", count: 5 },
  { id: "zh", name: "中文", flag: "🇨🇳", count: 3 },
  { id: "ar", name: "العربية", flag: "🇸🇦", count: 2 },
  { id: "pt", name: "Português", flag: "🇵🇹", count: 1 },
];

const navItems: { id: View; label: string; icon: string }[] = [
  { id: "pipeline", label: "Лиды", icon: "▦" },
  { id: "inbox", label: "Диалоги", icon: "◫" },
  { id: "broadcasts", label: "Рассылки", icon: "↗" },
  { id: "automation", label: "Автоцепочки", icon: "⌁" },
  { id: "channels", label: "Каналы", icon: "◎" },
];

export default function Home() {
  const [view, setView] = useState<View>("pipeline");
  const [leads, setLeads] = useState(initialLeads);
  const [activeLanguage, setActiveLanguage] = useState("ru");
  const [drafts, setDrafts] = useState<Record<string, string>>({
    ru: "Привет, {{first_name}}! 👋\n\nМы подготовили для вас короткое демо. Покажем, как автоматизировать первые ответы клиентам и не терять заявки.",
    en: "Hi, {{first_name}}! 👋\n\nWe prepared a short demo showing how to automate first replies and keep every lead in sight.",
    es: "¡Hola, {{first_name}}! 👋\n\nPreparamos una breve demostración para tu equipo.",
    zh: "你好，{{first_name}}！👋\n\n我们为您的团队准备了一个简短的演示。",
    ar: "مرحباً {{first_name}}! 👋\n\nلقد أعددنا عرضاً توضيحياً قصيراً لفريقك.",
    pt: "Olá, {{first_name}}! 👋\n\nPreparamos uma demonstração curta para sua equipe.",
  });
  const [scheduled, setScheduled] = useState(false);
  const [sentToast, setSentToast] = useState("");
  const [attachment, setAttachment] = useState("");
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const stats = useMemo(() => ({
    total: leads.length,
    active: leads.filter((lead) => lead.status !== "won").length,
    unread: leads.reduce((sum, lead) => sum + (lead.unread || 0), 0),
    won: leads.filter((lead) => lead.status === "won").length,
  }), [leads]);

  function moveLead(id: number, status: LeadStatus) {
    setLeads((current) => current.map((lead) => (lead.id === id ? { ...lead, status } : lead)));
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
        <div className="brand"><span className="brand-mark">A</span><span>ASCN</span></div>
        <div className="workspace-switcher">
          <div className="bot-avatar">S</div>
          <div><strong>Sales Bot</strong><span>Работает</span></div>
          <button aria-label="Выбрать проект" onClick={() => notify("Других проектов пока нет")}>⌄</button>
        </div>

        <nav className="main-nav">
          <p>РАБОЧЕЕ ПРОСТРАНСТВО</p>
          {navItems.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>
              <span className="nav-icon">{item.icon}</span>{item.label}
              {item.id === "inbox" && stats.unread > 0 && <b>{stats.unread}</b>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button onClick={() => notify("Настройки откроются в следующей версии")}>⚙ Настройки</button>
          <div className="profile"><span>АМ</span><div><strong>Алексей Морозов</strong><small>Владелец</small></div><button aria-label="Меню профиля" onClick={() => notify("Профиль владельца")}>⋯</button></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumbs"><span>Sales Bot</span><i>/</i><strong>{navItems.find((item) => item.id === view)?.label}</strong></div>
          <div className="top-actions"><button aria-label="Поиск" onClick={() => notify("Поиск доступен внутри разделов")}>⌕</button><button aria-label="Уведомления" onClick={() => notify("Новых уведомлений нет")}>♢<span className="notification-dot" /></button><button className="help" aria-label="Помощь" onClick={() => notify("Напишите в поддержку ASCN")}>?</button></div>
        </header>

        <div className="content">
          {view === "pipeline" && <Pipeline leads={leads} stats={stats} moveLead={moveLead} setView={setView} notify={notify} />}
          {view === "inbox" && <Inbox leads={leads} notify={notify} />}
          {view === "broadcasts" && (
            <Broadcasts
              activeLanguage={activeLanguage}
              setActiveLanguage={setActiveLanguage}
              drafts={drafts}
              setDrafts={setDrafts}
              scheduled={scheduled}
              setScheduled={setScheduled}
              attachment={attachment}
              setAttachment={setAttachment}
              editorRef={editorRef}
              insertFormatting={insertFormatting}
              notify={notify}
            />
          )}
          {view === "automation" && <Automation notify={notify} />}
          {view === "channels" && <Channels notify={notify} />}
        </div>
      </section>

      {sentToast && <div className="toast"><span>✓</span>{sentToast}</div>}
    </main>
  );
}

function PageHeader({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</div>;
}

function Pipeline({ leads, stats, moveLead, setView, notify }: { leads: Lead[]; stats: { total: number; active: number; unread: number; won: number }; moveLead: (id: number, status: LeadStatus) => void; setView: (view: View) => void; notify: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("all");
  const [channel, setChannel] = useState("all");
  const visibleLeads = leads.filter((lead) => {
    const matchesQuery = `${lead.name} ${lead.handle}`.toLowerCase().includes(query.toLowerCase());
    const matchesLanguage = language === "all" || lead.language === language;
    const matchesChannel = channel === "all" || lead.source === channel;
    return matchesQuery && matchesLanguage && matchesChannel;
  });
  return <>
    <PageHeader eyebrow="CRM ДЛЯ МЕССЕНДЖЕРОВ" title="Воронка лидов" text="Все, кто написал вашему боту, автоматически появляются здесь." action={<button className="primary-button" onClick={() => setView("broadcasts")}>＋ Новая рассылка</button>} />
    <div className="metric-row">
      <Metric label="Всего лидов" value={stats.total} note="+18% за неделю" positive />
      <Metric label="Активные диалоги" value={stats.active} note="3 ждут ответа" />
      <Metric label="Новые сообщения" value={stats.unread} note="за последние 24 часа" />
      <Metric label="Конверсия в сделку" value="14.2%" note="+2.4% к прошлой неделе" positive />
    </div>
    <div className="board-toolbar"><div className="search-box">⌕ <input aria-label="Поиск лидов" placeholder="Поиск по имени или username" value={query} onChange={(event) => setQuery(event.target.value)} /></div><select className="filter-button" aria-label="Фильтр по языку" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="all">Все языки</option>{languages.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select><select className="filter-button" aria-label="Фильтр по каналу" value={channel} onChange={(event) => setChannel(event.target.value)}><option value="all">Все каналы</option><option>Telegram</option><option>WhatsApp</option></select><span className="spacer" /><button className="icon-button" aria-label="Дополнительные действия" onClick={() => notify("Экспорт появится после подключения базы")}>•••</button></div>
    <div className="kanban">
      {columns.map((column) => {
        const items = visibleLeads.filter((lead) => lead.status === column.id);
        return <section className="kanban-column" key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => moveLead(Number(event.dataTransfer.getData("lead")), column.id)}>
          <header><div><span className={`status-dot ${column.dot}`} /><strong>{column.title}</strong><b>{items.length}</b></div><button aria-label={`Добавить лида в ${column.title}`} onClick={() => notify("Новый лид появится после первого сообщения боту")}>＋</button></header>
          <div className="kanban-list">
            {items.map((lead) => <LeadCard key={lead.id} lead={lead} onDragStart={(event) => event.dataTransfer.setData("lead", String(lead.id))} notify={notify} />)}
            {items.length === 0 && <div className="empty-drop">Перетащите лида сюда</div>}
          </div>
        </section>;
      })}
    </div>
  </>;
}

function Metric({ label, value, note, positive }: { label: string; value: number | string; note: string; positive?: boolean }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small className={positive ? "positive" : ""}>{positive ? "↗ " : ""}{note}</small></article>;
}

function LeadCard({ lead, onDragStart, notify }: { lead: Lead; onDragStart: React.DragEventHandler<HTMLElement>; notify: (message: string) => void }) {
  return <article className="lead-card" draggable onDragStart={onDragStart}>
    <div className="lead-head"><div className={`lead-avatar avatar-${lead.id}`}>{lead.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div><div><strong>{lead.name}</strong><span>{lead.handle}</span></div><button aria-label={`Действия для ${lead.name}`} onClick={() => notify(`Карточка ${lead.name}`)}>•••</button></div>
    <p>{lead.message}</p>
    <div className="lead-tags"><span>{lead.flag} {lead.language}</span><span className={lead.source === "Telegram" ? "telegram" : "whatsapp"}>{lead.source === "Telegram" ? "✈" : "◉"}</span></div>
    <footer><time>{lead.time}</time>{lead.value && <strong>{lead.value}</strong>}{lead.unread && <b>{lead.unread}</b>}</footer>
  </article>;
}

function Inbox({ leads, notify }: { leads: Lead[]; notify: (message: string) => void }) {
  const [selected, setSelected] = useState(leads[0].id);
  const [message, setMessage] = useState("");
  const [lastSent, setLastSent] = useState("");
  const [note, setNote] = useState("");
  const lead = leads.find((item) => item.id === selected) || leads[0];
  function sendMessage() {
    const cleanMessage = message.trim();
    if (!cleanMessage) return;
    setLastSent(cleanMessage);
    setMessage("");
    notify("Сообщение добавлено в диалог");
  }
  return <>
    <PageHeader eyebrow="ЕДИНЫЙ ИНБОКС" title="Диалоги" text="Telegram и WhatsApp в одном окне — вместе с историей и статусом лида." />
    <div className="inbox-layout">
      <section className="conversation-list"><div className="conversation-search">⌕ <input placeholder="Найти диалог" /></div>{leads.map((item) => <button key={item.id} className={selected === item.id ? "selected" : ""} onClick={() => setSelected(item.id)}><span className={`lead-avatar avatar-${item.id}`}>{item.name[0]}</span><div><strong>{item.name}</strong><p>{item.message}</p></div><time>{item.time}</time>{item.unread && <b>{item.unread}</b>}</button>)}</section>
      <section className="chat-panel"><header><div className={`lead-avatar avatar-${lead.id}`}>{lead.name[0]}</div><div><strong>{lead.name}</strong><span><i /> онлайн · {lead.source}</span></div><button aria-label="Меню диалога" onClick={() => notify("Меню диалога открыто")}>⋯</button></header><div className="messages"><div className="date-chip">Сегодня</div><div className="bubble incoming">Здравствуйте! {lead.message}<time>12:04</time></div><div className="bubble outgoing">Привет! Да, конечно. Сейчас подберу подходящий вариант и пришлю детали.<time>12:06 ✓✓</time></div><div className="bubble incoming">Отлично, спасибо!<time>12:07</time></div>{lastSent && <div className="bubble outgoing">{lastSent}<time>сейчас ✓</time></div>}</div><footer><button aria-label="Прикрепить файл" onClick={() => notify("Выберите файл в редакторе рассылок")}>＋</button><input aria-label="Новое сообщение" placeholder="Напишите сообщение..." value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendMessage(); }} /><button className="send-button" aria-label="Отправить сообщение" onClick={sendMessage}>➤</button></footer></section>
      <aside className="contact-panel"><div className={`lead-avatar large avatar-${lead.id}`}>{lead.name[0]}</div><h3>{lead.name}</h3><p>{lead.handle}</p><div className="contact-actions"><button aria-label="Открыть профиль" onClick={() => notify(`Профиль ${lead.handle}`)}>✈</button><button aria-label="Позвонить" onClick={() => notify("Звонки подключаются через WhatsApp Business")}>☎</button><button aria-label="Дополнительные действия" onClick={() => notify("Дополнительные действия")}>•••</button></div><dl><div><dt>Язык</dt><dd>{lead.flag} {lead.language}</dd></div><div><dt>Канал</dt><dd>{lead.source}</dd></div><div><dt>Этап</dt><dd>{columns.find((item) => item.id === lead.status)?.title}</dd></div><div><dt>Последняя активность</dt><dd>{lead.time} назад</dd></div></dl><label htmlFor="contact-note">Заметка</label><textarea id="contact-note" placeholder="Добавить заметку о клиенте" value={note} onChange={(event) => setNote(event.target.value)} /><button className="ghost-button" onClick={() => notify(note.trim() ? "Заметка сохранена" : "Сначала напишите заметку")}>Сохранить заметку</button></aside>
    </div>
  </>;
}

function Broadcasts({ activeLanguage, setActiveLanguage, drafts, setDrafts, scheduled, setScheduled, attachment, setAttachment, editorRef, insertFormatting, notify }: {
  activeLanguage: string; setActiveLanguage: (id: string) => void; drafts: Record<string, string>; setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>; scheduled: boolean; setScheduled: (value: boolean) => void; attachment: string; setAttachment: (value: string) => void; editorRef: React.RefObject<HTMLTextAreaElement | null>; insertFormatting: (before: string, after?: string) => void; notify: (message: string) => void;
}) {
  const active = languages.find((language) => language.id === activeLanguage)!;
  const [previewChannel, setPreviewChannel] = useState<"Telegram" | "WhatsApp">("Telegram");
  return <>
    <PageHeader eyebrow="КАМПАНИИ" title="Новая рассылка" text="Одно сообщение — каждому получателю на его языке." action={<button className="ghost-button" onClick={() => notify("Черновик сохранен")}>Сохранить черновик</button>} />
    <div className="campaign-layout">
      <section className="campaign-card audience-card"><div className="section-number">1</div><div className="section-content"><h2>Кому отправляем</h2><p>Выберите сегмент или конкретных получателей.</p><div className="form-grid"><label>Этап воронки<select><option>Все активные лиды</option><option>Новые</option><option>Квалификация</option><option>В диалоге</option></select></label><label>Канал<select><option>Telegram и WhatsApp</option><option>Только Telegram</option><option>Только WhatsApp</option></select></label></div><div className="audience-summary"><div className="avatar-stack"><span>А</span><span>S</span><span>D</span><span>М</span></div><strong>42 получателя</strong><span>на 6 языках</span></div></div></section>
      <section className="campaign-card editor-card"><div className="section-number">2</div><div className="section-content"><h2>Сообщение</h2><p>Переключайтесь между языками — получатель увидит свою версию.</p><div className="language-tabs">{languages.map((language) => <button key={language.id} className={activeLanguage === language.id ? "active" : ""} onClick={() => setActiveLanguage(language.id)}>{language.flag} {language.name}<span>{language.count}</span></button>)}</div><div className="editor"><div className="editor-toolbar"><button onClick={() => insertFormatting("**")}>B</button><button className="italic" onClick={() => insertFormatting("__")}>I</button><button onClick={() => insertFormatting("<u>", "</u>")}>U</button><i /><button onClick={() => insertFormatting("[", "](https://)")}>🔗</button><button onClick={() => insertFormatting("{{first_name}}", "")}>{"{}"}</button><button onClick={() => insertFormatting("😊", "")}>☺</button></div><textarea ref={editorRef} value={drafts[activeLanguage]} onChange={(event) => setDrafts((current) => ({ ...current, [activeLanguage]: event.target.value }))} aria-label={`Текст рассылки на языке ${active.name}`} /><footer><span>{drafts[activeLanguage].length} символов</span><span>Переменная: {"{{first_name}}"}</span></footer></div><div className="attachment-row"><label className="upload-button">＋ Добавить фото или файл<input type="file" accept="image/*,.pdf" onChange={(event) => setAttachment(event.target.files?.[0]?.name || "")} /></label>{attachment && <div className="attachment-chip">▧ {attachment}<button onClick={() => setAttachment("")}>×</button></div>}</div></div></section>
      <section className="campaign-card schedule-card"><div className="section-number">3</div><div className="section-content"><h2>Когда отправить</h2><p>Отправьте сейчас или назначьте время с учетом часового пояса.</p><div className="schedule-options"><button className={!scheduled ? "selected" : ""} onClick={() => setScheduled(false)}><i>●</i><div><strong>Сейчас</strong><span>Рассылка начнется после подтверждения</span></div></button><button className={scheduled ? "selected" : ""} onClick={() => setScheduled(true)}><i>◷</i><div><strong>Запланировать</strong><span>Выбрать дату и время</span></div></button></div>{scheduled && <div className="datetime-row"><input type="date" defaultValue="2026-08-13" /><input type="time" defaultValue="10:00" /><select><option>UTC+3 · Москва</option><option>UTC+0 · London</option></select></div>}</div></section>
      <aside className="preview-card"><header><span>Предпросмотр</span><div><button aria-label="Предпросмотр Telegram" className={previewChannel === "Telegram" ? "active" : ""} onClick={() => setPreviewChannel("Telegram")}>✈</button><button aria-label="Предпросмотр WhatsApp" className={previewChannel === "WhatsApp" ? "active" : ""} onClick={() => setPreviewChannel("WhatsApp")}>◉</button></div></header><div className="phone"><div className="phone-top"><span>9:41</span><span>● ● ▰</span></div><div className="telegram-head"><span className="preview-back">‹</span><div className="bot-avatar">S</div><div><strong>Sales Bot</strong><span>{previewChannel === "Telegram" ? "бот" : "WhatsApp Business"}</span></div></div><div className="phone-chat"><div className="preview-bubble">{attachment && <div className="preview-image"><span>ASCN</span><small>{attachment}</small></div>}<p>{drafts[activeLanguage].replace("{{first_name}}", "Алексей")}</p><time>12:45 ✓✓</time></div></div></div><div className="preview-language">{active.flag} {active.name} · {previewChannel}</div></aside>
    </div>
    <div className="send-bar"><div><strong>Готово к отправке</strong><span>42 получателя · 6 языков · Telegram + WhatsApp</span></div><button className="primary-button large" onClick={() => notify(scheduled ? "Рассылка запланирована" : "Рассылка отправлена 42 получателям")}>{scheduled ? "Запланировать" : "Отправить рассылку"} →</button></div>
  </>;
}

function Automation({ notify }: { notify: (message: string) => void }) {
  const steps = [
    { delay: "Сразу", title: "Первое знакомство", text: "Приветствие и короткий вопрос о задаче", enabled: true },
    { delay: "Через 15 мин", title: "Показать возможности", text: "Кейс и ссылка на демо продукта", enabled: true },
    { delay: "Через 4 часа", title: "Мягкий follow-up", text: "Уточнить, остались ли вопросы", enabled: true },
    { delay: "Через 1 день", title: "Передать менеджеру", text: "Напоминание оператору и смена этапа", enabled: false },
  ];
  return <>
    <PageHeader eyebrow="АВТОМАТИЗАЦИЯ" title="Автоцепочки" text="Бот сам догревает лида и останавливается, как только человек отвечает." action={<button className="primary-button" onClick={() => notify("Новый шаг добавлен")}>＋ Добавить шаг</button>} />
    <div className="automation-banner"><div><span>⌁</span><div><strong>Главная воронка продаж</strong><p>Запускается после первого сообщения клиента · 6 языков</p></div></div><label className="switch" aria-label="Включить главную воронку"><input type="checkbox" defaultChecked /><span /></label></div>
    <div className="automation-list">{steps.map((step, index) => <article key={step.title}><div className="timeline"><span>{index + 1}</span>{index < steps.length - 1 && <i />}</div><div className="automation-content"><header><div><small>{step.delay}</small><h3>{step.title}</h3></div><label className="switch small" aria-label={`Включить шаг ${step.title}`}><input type="checkbox" defaultChecked={step.enabled} /><span /></label></header><p>{step.text}</p><footer><span>🇷🇺 🇬🇧 🇪🇸 🇨🇳 🇸🇦 🇵🇹</span><span>Условие: если не ответил</span><button onClick={() => notify(`Редактирование шага «${step.title}»`)}>Изменить</button></footer></div></article>)}</div>
  </>;
}

function Channels({ notify }: { notify: (message: string) => void }) {
  return <>
    <PageHeader eyebrow="ИНТЕГРАЦИИ" title="Каналы" text="Подключите ботов, через которых агент будет получать лидов и отправлять сообщения." action={<button className="primary-button" onClick={() => notify("Открываем подключение нового канала")}>＋ Подключить канал</button>} />
    <div className="channel-grid">
      <article className="channel-card connected"><Image className="channel-logo" src="/telegram-logo.svg" alt="Логотип Telegram" width={48} height={48} /><div className="channel-title"><div><h3>Telegram</h3><span>Подключено</span></div></div><p>@ascn_sales_bot</p><dl><div><dt>Подписчиков</dt><dd>1 248</dd></div><div><dt>Новых за неделю</dt><dd>+86</dd></div><div><dt>Доставка</dt><dd>99.4%</dd></div></dl><footer><button onClick={() => notify("Тестовое сообщение отправлено в Telegram")}>Отправить тест</button><button onClick={() => notify("Настройки Telegram открыты")}>Настроить</button></footer></article>
      <article className="channel-card connected"><Image className="channel-logo" src="/whatsapp-logo.svg" alt="Логотип WhatsApp" width={48} height={48} /><div className="channel-title"><div><h3>WhatsApp Business</h3><span>Подключено</span></div></div><p>+1 415 555 0136</p><dl><div><dt>Контактов</dt><dd>483</dd></div><div><dt>Новых за неделю</dt><dd>+29</dd></div><div><dt>Доставка</dt><dd>97.8%</dd></div></dl><footer><button onClick={() => notify("Тестовое сообщение отправлено в WhatsApp")}>Отправить тест</button><button onClick={() => notify("Настройки WhatsApp открыты")}>Настроить</button></footer></article>
      <article className="channel-card add-channel"><div className="add-circle">＋</div><h3>Подключить еще канал</h3><p>Добавьте нового Telegram-бота или номер WhatsApp Business.</p><button className="ghost-button" onClick={() => notify("Выберите Telegram или WhatsApp")}>Подключить</button></article>
    </div>
    <div className="settings-card"><div><span className="settings-icon">♢</span><div><h3>Уведомления оператору</h3><p>Получайте сообщение в Telegram, когда новый лид пишет боту или просит менеджера.</p></div></div><button className="ghost-button" onClick={() => notify("Настройки уведомлений открыты")}>Настроить</button></div>
  </>;
}
