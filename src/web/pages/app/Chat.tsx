import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { api, ApiException, type ModelInfo } from '../../api';
import { useToast } from '../../components/Toast';
import { useStore } from '../../store';
import { Spinner, Confirm, Empty } from '../../components/ui';
import { IconSend, IconPlus, IconChat, IconTrash, IconSparkle, IconLock } from '../../components/Icons';

interface Conv { id: string; title: string; updated_at: number }
interface Msg { id?: string; role: 'user' | 'assistant'; content: string }

export default function Chat() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const { id } = useParams();
  const { me, refreshMe } = useStore();

  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [convId, setConvId] = useState<string | null>(id || null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelId, setModelId] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [noModel, setNoModel] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const C = t.chat;

  const loadConvs = useCallback(async () => {
    try {
      const d = await api.get<{ conversations: Conv[] }>('/api/chat/conversations');
      setConvs(d.conversations);
    } catch { setConvs([]); }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const d = await api.get<{ models: ModelInfo[] }>('/api/chat/models');
      setModels(d.models);
      const avail = d.models.filter((m) => m.available);
      if (d.models.length === 0) setNoModel(true);
      if (!modelId && avail.length) setModelId(avail[0].id);
    } catch { setNoModel(true); }
  }, [modelId]);

  useEffect(() => { loadConvs(); loadModels(); }, [loadConvs, loadModels]);

  const openConv = useCallback(async (cid: string | null) => {
    setConvId(cid);
    setMessages([]);
    if (!cid) { nav('/app/chat', { replace: true }); return; }
    setLoadingMsgs(true);
    try {
      const d = await api.get<{ messages: Msg[]; conversation: { model_id: string } }>(`/api/chat/conversations/${cid}`);
      setMessages(d.messages.map((m) => ({ role: m.role, content: m.content })));
    } catch {
      setConvId(null);
      nav('/app/chat', { replace: true });
    } finally { setLoadingMsgs(false); }
  }, [nav]);

  useEffect(() => { if (id) openConv(id); }, [id, openConv]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setBusy(true);
    try {
      const d = await api.post<{ conversation_id: string; reply: string }>('/api/chat/send', {
        conversation_id: convId || undefined, model_id: modelId || undefined, message: text,
      });
      setMessages((m) => [...m, { role: 'assistant', content: d.reply }]);
      if (!convId) { setConvId(d.conversation_id); nav(`/app/chat/${d.conversation_id}`, { replace: true }); }
      loadConvs();
      refreshMe();
    } catch (e) {
      const msg = e instanceof ApiException ? e.fa : t.common.error_generic;
      toast.error(msg);
      setMessages((m) => m.slice(0, -1));
      setInput(text);
    } finally { setBusy(false); }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const autoGrow = () => {
    const el = taRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(180, el.scrollHeight) + 'px'; }
  };

  const removeConv = async () => {
    if (!deleteId) return;
    try {
      await api.del(`/api/chat/conversations/${deleteId}`);
      toast.info(C.delete_chat);
      if (convId === deleteId) openConv(null);
      loadConvs();
    } catch { toast.error(t.common.error_generic); }
    setDeleteId(null);
  };

  const usage = me?.usage;
  const locked = (m: ModelInfo) => m.available === false;

  return (
    <div className="chat-wrap" style={{ margin: '-28px calc(-1 * clamp(16px, 3.5vw, 40px))' }}>
      {/* top strip */}
      <div className="row between" style={{ padding: '10px clamp(14px, 4vw, 60px)', borderBottom: '1px solid var(--stroke)' }}>
        <div className="row gap-s">
          <button className="btn ghost sm" onClick={() => openConv(null)}><IconPlus size={15} /> {C.new_chat}</button>
          {usage && <span className="badge green num">{C.quota_left}: <b>{Math.max(0, usage.message_limit - usage.message)}</b></span>}
        </div>
        <div className="row gap-s">
          <label className="tiny">{C.choose_model}</label>
          <select className="select" style={{ width: 'auto', padding: '7px 12px', fontSize: '0.85rem' }}
            value={modelId} onChange={(e) => setModelId(e.target.value)} aria-label={C.choose_model}>
            {models.map((m) => (
              <option key={m.id} value={m.id} disabled={locked(m)}>
                {m.name}{locked(m) ? ` 🔒 (${C.model_locked})` : ''}
              </option>
            ))}
            {models.length === 0 && <option value="">—</option>}
          </select>
        </div>
      </div>

      <div className="row" style={{ alignItems: 'stretch', flex: 1, minHeight: 0, gap: 0 }}>
        {/* conversation rail */}
        {convs && convs.length > 0 && (
          <div className="col gap-s" style={{ width: 240, flexShrink: 0, borderInlineEnd: '1px solid var(--stroke)', padding: 14, overflowY: 'auto', display: 'none' }} ref={(el) => { if (el) el.style.display = window.innerWidth > 920 ? 'flex' : 'none'; }}>
            {convs.map((c) => (
              <div key={c.id} className={`side-link ${convId === c.id ? 'active' : ''}`} style={{ cursor: 'pointer', justifyContent: 'space-between' }}
                onClick={() => openConv(c.id)} role="button" tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && openConv(c.id)}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'گفتگو'}</span>
                <IconTrash size={13} className="dim" onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }} />
              </div>
            ))}
          </div>
        )}

        <div className="grow col" style={{ minWidth: 0 }}>
          {/* messages */}
          <div className="chat-scroll" ref={scrollRef}>
            {noModel ? (
              <div style={{ margin: 'auto' }}>
                <Empty icon={<IconSparkle size={30} />} title={C.no_model_title} sub={C.no_model_sub} />
              </div>
            ) : loadingMsgs ? (
              <div style={{ margin: 'auto' }}><Spinner lg /></div>
            ) : messages.length === 0 ? (
              <div style={{ margin: 'auto', textAlign: 'center' }}>
                <div className="feature-icon" style={{ margin: '0 auto 16px', width: 66, height: 66, borderRadius: 20 }}><IconChat size={30} /></div>
                <h2>{C.empty_title}</h2>
                <p className="muted mt-s">{C.empty_sub}</p>
                <div className="row center gap-l mt-l wrap">
                  {[locale === 'fa' ? 'یک شعر کوتاه درباره باران بنویس' : 'Write a short poem about rain',
                    locale === 'fa' ? 'چطور رزومه بهتری بنویسم؟' : 'How do I improve my resume?',
                    locale === 'fa' ? 'یک برنامه سه‌روزه ورزشی پیشنهاد بده' : 'Suggest a 3-day workout plan'].map((q) => (
                    <button key={q} className="card hoverable small" style={{ cursor: 'pointer', maxWidth: 240 }}
                      onClick={() => { setInput(q); taRef.current?.focus(); }}>{q}</button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  <div className="avatar">{m.role === 'assistant' ? 'AI' : (me?.user?.name || 'U').slice(0, 1)}</div>
                  <div className="bubble">{m.content}</div>
                </div>
              ))
            )}
            {busy && (
              <div className="msg assistant">
                <div className="avatar">AI</div>
                <div className="bubble"><span className="typing" aria-label={C.thinking}><i /><i /><i /></span></div>
              </div>
            )}
          </div>

          {/* input */}
          <div className="chat-input-bar">
            <div className="chat-input-inner">
              <textarea ref={taRef} className="textarea grow" rows={1} value={input}
                placeholder={noModel ? C.no_model_title : C.placeholder}
                disabled={noModel || busy}
                onChange={(e) => { setInput(e.target.value); autoGrow(); }}
                onKeyDown={onKey} aria-label={C.placeholder} />
              <button className="btn primary" onClick={send} disabled={noModel || busy || !input.trim()} aria-label={C.send}>
                {busy ? <Spinner /> : <IconSend size={17} style={{ transform: locale === 'fa' ? 'scaleX(-1)' : 'none' }} />}
              </button>
            </div>
            {models.some(locked) && (
              <p className="tiny center mt-s" style={{ textAlign: 'center' }}>
                <IconLock size={11} /> {C.upgrade_to_model} <a href="/app/pricing">{t.nav.pricing}</a>
              </p>
            )}
          </div>
        </div>
      </div>

      {deleteId && (
        <Confirm title={C.delete_chat} message={C.delete_chat_q} danger
          onConfirm={removeConv} onClose={() => setDeleteId(null)} />
      )}
    </div>
  );
}
