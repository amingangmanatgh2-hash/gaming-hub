/**
 * مش (Mesh) WebRTC — هر نفر با هر نفر یک اتصال مستقیم
 * ───────────────────────────────────────────────────
 * • دو m-line از پیش ساخته می‌شود (صدا + تصویر) تا روشن/خاموش‌کردن میکروفن و
 *   دوربین هیچ مذاکرهٔ مجددی لازم نداشته باشد → کاملاً روان روی اینترنت ضعیف.
 * • مذاکرهٔ مودبانه (Perfect Negotiation) برای جلوگیری از قفل‌شدن اتصال.
 * • مشخصات کم/زیاد از طریق SDP محدود می‌شود؛ سه کیفیت آماده برای ایران.
 */
import { Emitter } from './util.js';
import { DEFAULT_STUN } from '../../shared/turn.js';

export const PROFILES = {
  lite: {
    key: 'lite', label: 'سبک — اینترنت ضعیف',
    video: { w: 320, h: 180, fps: 12 }, kbps: 80, scale: 4, degrade: 'maintain-framerate',
    screenKbps: 320, screenW: 960,
  },
  normal: {
    key: 'normal', label: 'معمولی — پیشنهادی',
    video: { w: 640, h: 360, fps: 20 }, kbps: 220, scale: 2, degrade: 'balanced',
    screenKbps: 900, screenW: 1280,
  },
  hd: {
    key: 'hd', label: 'HD — اینترنت پرسرعت',
    video: { w: 1280, h: 720, fps: 24 }, kbps: 1100, scale: 1, degrade: 'balanced',
    screenKbps: 2200, screenW: 1920,
  },
  audio: {
    key: 'audio', label: 'فقط صدا — کم‌مصرف‌ترین',
    video: { w: 160, h: 90, fps: 1 }, kbps: 0, scale: 4, degrade: 'maintain-framerate',
    screenKbps: 300, screenW: 960,
  },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

export class Mesh extends Emitter {
  constructor({ selfId, ice = [], send, profile = 'normal' }) {
    super();
    this.selfId = selfId;
    this.send = send; // (toId, payload) => void
    this.peers = new Map();
    this.profile = profile;
    this.ice = (Array.isArray(ice) && ice.length) ? ice : [{ urls: [...DEFAULT_STUN] }];
    this.tracks = { mic: null, cam: null, screenV: null, screenA: null };
  }

  setIce(servers) {
    if (Array.isArray(servers) && servers.length) this.ice = servers;
  }

  setProfile(key) {
    if (!PROFILES[key]) return;
    this.profile = key;
    for (const p of this.peers.values()) this.applyParams(p);
    this.emit('profile', key);
  }

  /* ── ساخت/حذف همتا ── */
  ensurePeer(id, { initiator = false, polite = null } = {}) {
    if (id === this.selfId) return null;
    let p = this.peers.get(id);
    if (p && p.pc.connectionState !== 'closed') return p;
    const pc = new RTCPeerConnection({
      iceServers: this.ice,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 1,
    });
    p = {
      id,
      pc,
      polite: polite == null ? this.selfId < id : polite,
      makingOffer: false,
      ignoreOffer: false,
      initiator,
      streams: { mic: new MediaStream(), cam: new MediaStream(), screen: new MediaStream(), screenA: new MediaStream() },
      state: 'new',
      senders: { mic: null, cam: null, screenV: null, screenA: null },
      tr: { mic: null, cam: null, screenV: null, screenA: null },
      quality: {},
      stats: {},
    };
    this.peers.set(id, p);

    // m-line های پیش‌فرض: صدا، تصویر
    p.tr.mic = pc.addTransceiver('audio', { direction: 'sendrecv' });
    p.tr.cam = pc.addTransceiver('video', { direction: 'sendrecv' });
    p.senders.mic = p.tr.mic.sender;
    p.senders.cam = p.tr.cam.sender;
    p.tr.mic.__role = 'mic';
    p.tr.cam.__role = 'cam';

    try { p.senders.mic.setParameters?.({ encodings: [{ maxBitrate: 40000 }] }); } catch { /* ignore */ }

    pc.onicecandidate = (e) => {
      if (e.candidate) this.send(id, { cand: e.candidate.toJSON() });
      else this.send(id, { cand: { end: true } });
    };
    pc.ontrack = (e) => {
      const role = this.roleOfTransceiver(p, e.transceiver);
      const stream = p.streams[role] || p.streams.cam;
      if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
      e.track.onended = () => { try { stream.removeTrack(e.track); } catch { /* ignore */ } };
      e.track.onmute = () => this.emit('stream', id, role);
      e.track.onunmute = () => this.emit('stream', id, role);
      this.emit('stream', id, role, stream);
    };
    pc.onnegotiationneeded = async () => {
      await this.negotiate(p);
    };
    pc.onconnectionstatechange = () => {
      p.state = pc.connectionState;
      this.emit('state', id, p.state);
      if (p.state === 'failed') this.restartIce(p);
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') this.restartIce(p);
    };
    pc.onsignalingstatechange = () => {
      if (pc.signalingState === 'stable') this.rebind(p);
    };

    // اگر ما تازه‌وارد هستیم، به همتای قدیمی‌تر پیشنهاد می‌دهیم
    if (initiator) setTimeout(() => this.negotiate(p), 0);
    this.emit('peer', id);
    return p;
  }

  roleOfTransceiver(p, tr) {
    if (tr === p.tr.mic) return 'mic';
    if (tr === p.tr.cam) return 'cam';
    if (tr === p.tr.screenV) return 'screen';
    if (tr === p.tr.screenA) return 'screenA';
    // اگر مرورگر m-line خودش را ساخته باشد: بر اساس نوع و ترتیب تشخیص می‌دهیم
    if (tr.__role) return tr.__role;
    if (tr.receiver?.track?.kind === 'audio') return tr.mid === '0' ? 'mic' : 'screenA';
    return tr.mid === '1' ? 'cam' : 'screen';
  }

  /** نقش senderها را بعد از هر مذاکره دوباره به m-line های واقعی می‌بندیم */
  rebind(p) {
    const trs = p.pc.getTransceivers().filter((t) => t.mid !== null);
    trs.sort((a, b) => Number(a.mid) - Number(b.mid));
    const audio = trs.filter((t) => t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio');
    const video = trs.filter((t) => !audio.includes(t));
    const micTr = audio.find((t) => t.__role !== 'screenA') || audio[0];
    const camTr = video.find((t) => t.__role !== 'screenV') || video[0];
    if (micTr) { micTr.__role = 'mic'; p.tr.mic = micTr; p.senders.mic = micTr.sender; }
    if (camTr) { camTr.__role = 'cam'; p.tr.cam = camTr; p.senders.cam = camTr.sender; }
    // مسیرهای اشتراک صفحه
    for (const t of trs) {
      if (t === p.tr.mic || t === p.tr.cam) continue;
      const isAudio = (t.receiver?.track?.kind || t.sender?.track?.kind) === 'audio';
      if (isAudio && !p.tr.screenA) { t.__role = 'screenA'; p.tr.screenA = t; p.senders.screenA = t.sender; }
      else if (!isAudio && !p.tr.screenV) { t.__role = 'screenV'; p.tr.screenV = t; p.senders.screenV = t.sender; }
    }
    this.pushLocalTracks(p);
  }

  /** ترک‌های محلی را روی senderهای درست می‌گذاریم (بدون مذاکرهٔ مجدد) */
  async pushLocalTracks(p) {
    const jobs = [];
    const put = (sender, track) => {
      if (!sender) return;
      jobs.push(sender.replaceTrack(track || null).catch(() => {}));
    };
    put(p.senders.mic, this.tracks.mic);
    put(p.senders.cam, this.tracks.cam);
    if (p.senders.screenV) put(p.senders.screenV, this.tracks.screenV);
    if (p.senders.screenA) put(p.senders.screenA, this.tracks.screenA);
    await Promise.all(jobs);
    this.applyParams(p);
  }

  async negotiate(p) {
    if (!p || p.pc.signalingState === 'closed') return;
    try {
      if (p.makingOffer) return;
      p.makingOffer = true;
      await p.pc.setLocalDescription();
      this.send(p.id, { sdp: p.pc.localDescription });
    } catch (e) {
      this.emit('error', p.id, e);
    } finally {
      p.makingOffer = false;
    }
  }

  async handleSignal(from, d) {
    if (!d) return;
    const p = this.peers.get(from) || this.ensurePeer(from, { initiator: false });
    if (!p) return;
    try {
      if (d.sdp) {
        const offerCollision = d.sdp.type === 'offer' && (p.makingOffer || p.pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && offerCollision;
        if (p.ignoreOffer) return;
        await p.pc.setRemoteDescription(d.sdp);
        if (d.sdp.type === 'offer') {
          await p.pc.setLocalDescription();
          this.send(from, { sdp: p.pc.localDescription });
        }
        this.rebind(p);
      } else if (d.cand) {
        if (d.cand.end) return;
        try {
          await p.pc.addIceCandidate(d.cand);
        } catch (e) {
          if (!p.ignoreOffer) throw e;
        }
      }
    } catch (e) {
      this.emit('error', from, e);
    }
  }

  async restartIce(p) {
    if (!p || p.pc.signalingState === 'closed') return;
    try {
      const offer = await p.pc.createOffer({ iceRestart: true });
      await p.pc.setLocalDescription(offer);
      this.send(p.id, { sdp: p.pc.localDescription });
      this.emit('ice-restart', p.id);
    } catch { /* ignore */ }
  }

  removePeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    try { p.pc.close(); } catch { /* ignore */ }
    this.peers.delete(id);
    this.emit('gone', id);
  }

  /* ── ترک‌های محلی ── */
  setMicTrack(track) {
    this.tracks.mic = track || null;
    this.forEachPeer((p) => { p.senders.mic?.replaceTrack(track || null).catch(() => {}); this.applyParams(p); });
  }
  setCamTrack(track) {
    this.tracks.cam = track || null;
    this.forEachPeer((p) => { p.senders.cam?.replaceTrack(track || null).catch(() => {}); this.applyParams(p); });
  }

  /** شروع اشتراک صفحه: یک m-line تصویر + (اختیاری) یک m-line صدا */
  async startScreen(stream) {
    const v = stream.getVideoTracks()[0] || null;
    const a = stream.getAudioTracks()[0] || null;
    this.tracks.screenV = v;
    this.tracks.screenA = a;
    for (const p of this.peers.values()) {
      if (!p.tr.screenV || p.tr.screenV.stopped) {
        p.tr.screenV = p.pc.addTransceiver('video', { direction: 'sendonly', streams: [p.streams.screen] });
        p.tr.screenV.__role = 'screenV';
        p.senders.screenV = p.tr.screenV.sender;
      }
      if (a && (!p.tr.screenA || p.tr.screenA.stopped)) {
        p.tr.screenA = p.pc.addTransceiver('audio', { direction: 'sendonly', streams: [p.streams.screenA] });
        p.tr.screenA.__role = 'screenA';
        p.senders.screenA = p.tr.screenA.sender;
      }
      await p.senders.screenV?.replaceTrack(v).catch(() => {});
      if (a) await p.senders.screenA?.replaceTrack(a).catch(() => {});
      else await p.senders.screenA?.replaceTrack(null).catch(() => {});
      this.applyParams(p);
    }
  }

  /** پایان اشتراک صفحه — m-line ها می‌مانند تا بعداً بدون مذاکره دوباره استفاده شوند */
  async stopScreen() {
    this.tracks.screenV = null;
    this.tracks.screenA = null;
    for (const p of this.peers.values()) {
      await p.senders.screenV?.replaceTrack(null).catch(() => {});
      await p.senders.screenA?.replaceTrack(null).catch(() => {});
    }
    this.emit('screen-stop');
  }

  /** تغییر کیفیت/نرخ بیت روی همهٔ فرستنده‌ها */
  applyParams(p) {
    const pr = PROFILES[this.profile] || PROFILES.normal;
    const set = (sender, kbps, scale, degrade) => {
      if (!sender) return;
      try {
        const params = sender.getParameters();
        params.encodings = params.encodings?.length ? params.encodings : [{}];
        params.encodings[0].maxBitrate = kbps * 1000;
        if (scale) params.encodings[0].scaleResolutionDownBy = scale;
        else delete params.encodings[0].scaleResolutionDownBy;
        if (degrade) params.degradationPreference = degrade;
        sender.setParameters(params).catch(() => {});
      } catch { /* برخی مرورگرها اجازه نمی‌دهند */ }
    };
    set(p.senders.cam, pr.kbps || 60, pr.scale, pr.degrade);
    set(p.senders.screenV, pr.screenKbps, 1, this.profile === 'lite' ? 'maintain-framerate' : 'maintain-resolution');
    set(p.senders.mic, this.profile === 'lite' ? 24000 : 40000, 0, null);
    set(p.senders.screenA, 64000, 0, null);
  }

  setScreenKbps(kbps) {
    for (const p of this.peers.values()) {
      const s = p.senders.screenV;
      if (!s) continue;
      try {
        const params = s.getParameters();
        params.encodings = params.encodings?.length ? params.encodings : [{}];
        params.encodings[0].maxBitrate = kbps * 1000;
        s.setParameters(params).catch(() => {});
      } catch { /* ignore */ }
    }
  }

  forEachPeer(fn) { for (const p of this.peers.values()) fn(p); }

  /* ── آمار و کیفیت ── */
  async collectStats() {
    const out = { rtt: 0, loss: 0, up: 0, down: 0, res: '', fps: 0, n: 0, limited: '', perPeer: {} };
    for (const p of this.peers.values()) {
      let st;
      try { st = await p.pc.getStats(); } catch { continue; }
      let rtt = 0;
      let loss = 0;
      let up = 0;
      let down = 0;
      let res = '';
      let fps = 0;
      let limited = '';
      st.forEach((r) => {
        if (r.type === 'candidate-pair' && (r.nominated || r.selected) && r.state === 'succeeded') {
          rtt = (r.currentRoundTripTime || 0) * 1000;
        }
        if (r.type === 'inbound-rtp' && r.kind === 'video' && !r.isRemote) {
          const rec = r.packetsReceived || 0;
          const lost = r.packetsLost || 0;
          loss = rec + lost > 0 ? (lost / (rec + lost)) * 100 : 0;
          down += ((r.bytesReceived || 0) * 8) / 1000;
          fps = r.framesPerSecond || fps;
          if (r.frameWidth) res = `${r.frameWidth}×${r.frameHeight}`;
        }
        if (r.type === 'outbound-rtp' && !r.isRemote) {
          up += ((r.bytesSent || 0) * 8) / 1000;
          if (r.qualityLimitationReason) limited = r.qualityLimitationReason;
        }
        if (r.type === 'remote-inbound-rtp' && r.roundTripTime) rtt = r.roundTripTime * 1000;
        if (r.type === 'remote-inbound-rtp' && r.fractionLost != null && r.kind === 'audio') {
          loss = Math.max(loss, r.fractionLost * 100);
        }
      });
      p.stats = { rtt: Math.round(rtt), loss: Math.round(loss * 10) / 10, res, fps, limited };
      out.perPeer[p.id] = p.stats;
      out.rtt = Math.max(out.rtt, rtt);
      out.loss = Math.max(out.loss, loss);
      out.up += up;
      out.down += down;
      out.res = res || out.res;
      out.fps = fps || out.fps;
      out.limited = limited || out.limited;
      out.n++;
    }
    this.emit('stats', out.perPeer);
    return out;
  }

  close() {
    for (const id of [...this.peers.keys()]) this.removePeer(id);
  }
}
