/** تخته سفید مشترک: قلم، اشکال، متن، واگرد/ازنو، ذخیره PNG، بازپخش برای تازه‌واردها */
import { $, $$, el, toast, download, throttle } from '../core/util.js';

export class Board {
  constructor(ctx) {
    this.ctx = ctx;
    this.ops = [];
    this.redo = [];
    this.tool = 'pen';
    this.color = '#ffd166';
    this.size = 5;
    this.drawing = null;
    this.visible = false;
  }

  mount() {
    this.canvas = $('#board');
    if (!this.canvas) return;
    this.g = this.canvas.getContext('2d');
    this.resize();
    addEventListener('resize', throttle(() => this.resize(), 250));

    $$('[data-wb]').forEach((b) => {
      b.onclick = () => this.action(b.dataset.wb, b);
    });
    $('#wbColor').oninput = (e) => { this.color = e.target.value; };
    $('#wbSize').oninput = (e) => { this.size = Number(e.target.value); };
    $('#wbClose').onclick = () => this.ctx.toggleBoard(false);

    const pos = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const t = e.touches?.[0] || e;
      return {
        x: Math.round(((t.clientX - r.left) / r.width) * this.canvas.width),
        y: Math.round(((t.clientY - r.top) / r.height) * this.canvas.height),
      };
    };
    const down = (e) => {
      e.preventDefault();
      const p = pos(e);
      if (this.tool === 'text') {
        const text = prompt('متن را بنویسید:');
        if (text) this.commit({ t: 'text', x: p.x, y: p.y, text, color: this.color, size: this.size * 5 });
        return;
      }
      if (this.tool === 'eraser') {
        this.drawing = { t: 'erase', pts: [p], color: '#ffffff', size: this.size * 4 };
      } else if (['line', 'rect', 'circle', 'arrow'].includes(this.tool)) {
        this.drawing = { t: this.tool, a: p, b: p, color: this.color, size: this.size };
        this.draw();
      } else {
        this.drawing = { t: 'pen', pts: [p], color: this.color, size: this.size };
      }
    };
    const move = (e) => {
      if (!this.drawing) return;
      e.preventDefault();
      const p = pos(e);
      if (this.drawing.pts) this.drawing.pts.push(p);
      else this.drawing.b = p;
      this.draw();
      this.flush();
    };
    const up = () => {
      if (!this.drawing) return;
      this.commit(this.drawing);
      this.drawing = null;
    };
    this.canvas.addEventListener('pointerdown', down);
    this.canvas.addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    this.flush = throttle(() => {
      if (!this.drawing?.pts?.length) return;
      this.ctx.socket.send({ t: 'wb', ops: [this.drawing], full: false, w: this.canvas.width, h: this.canvas.height });
    }, 120);
  }

  resize() {
    const c = this.canvas;
    if (!c) return;
    const ratio = 16 / 9;
    const w = Math.min(1600, Math.max(640, Math.round(c.clientWidth || 1200)));
    c.width = w;
    c.height = Math.round(w / ratio);
    this.draw();
  }

  action(a, btn) {
    if (a === 'undo') { const op = this.ops.pop(); if (op) { this.redo.push(op); this.draw(); this.broadcastFull(); } return; }
    if (a === 'redo') { const op = this.redo.pop(); if (op) { this.ops.push(op); this.draw(); this.broadcastFull(); } return; }
    if (a === 'clear') {
      if (!confirm('کل تخته پاک شود؟')) return;
      this.ops = [];
      this.redo = [];
      this.draw();
      this.broadcastFull();
      return;
    }
    if (a === 'save') {
      const url = this.canvas.toDataURL('image/png');
      download(url, `board-${this.ctx.room.code}-${Date.now()}.png`);
      toast('تصویر تخته ذخیره شد', 'ok');
      return;
    }
    this.tool = a;
    $$('[data-wb]').forEach((b) => b.classList.remove('on'));
    btn?.classList.add('on');
    toast(`ابزار: ${btn?.textContent?.trim() || a}`, 'ok', 1100);
  }

  commit(op) {
    this.ops.push(op);
    this.redo = [];
    if (this.ops.length > 2500) this.ops.shift();
    this.draw();
    this.ctx.socket.send({ t: 'wb', ops: [op], full: false, w: this.canvas.width, h: this.canvas.height });
    if (this.ops.length % 40 === 0) this.broadcastFull();
  }

  broadcastFull() {
    this.ctx.socket.send({ t: 'wb', ops: this.ops, full: true, w: this.canvas.width, h: this.canvas.height });
  }

  /** دریافت از سرور: یا وضعیت کامل یا یک حرکت تازه */
  onRemote(m) {
    if (m.full && Array.isArray(m.ops)) {
      this.ops = m.ops;
      this.redo = [];
      this.draw();
      return;
    }
    if (Array.isArray(m.ops)) {
      for (const op of m.ops) {
        const last = this.ops[this.ops.length - 1];
        if (op.t === 'pen' && last && last.t === 'pen' && JSON.stringify(last.color) === JSON.stringify(op.color) && last.size === op.size && last.__from === m.from) {
          // ادامهٔ همان خط: نقطه‌ها را جایگزین می‌کنیم (سبک‌تر روی شبکه)
          this.ops[this.ops.length - 1] = { ...op, __from: m.from };
        } else {
          this.ops.push({ ...op, __from: m.from });
        }
      }
      if (this.ops.length > 3000) this.ops = this.ops.slice(-2500);
      this.draw();
    }
  }

  /** بازپخش وضعیت برای تازه‌وارد (در welcome می‌آید) */
  load(wb) {
    this.ops = Array.isArray(wb?.ops) ? wb.ops : [];
    this.draw();
  }

  draw() {
    if (!this.g || !this.canvas) return;
    const g = this.g;
    const { width: W, height: H } = this.canvas;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#fbfcff';
    g.fillRect(0, 0, W, H);
    const all = this.drawing ? [...this.ops, this.drawing] : this.ops;
    for (const op of all) this.paint(op, g);
  }

  paint(op, g) {
    if (!op) return;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (op.t === 'pen' || op.t === 'erase') {
      g.strokeStyle = op.t === 'erase' ? '#fbfcff' : op.color;
      g.lineWidth = op.size * (this.canvas.width / 1200);
      g.beginPath();
      (op.pts || []).forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
    } else if (op.t === 'line' || op.t === 'arrow') {
      g.strokeStyle = op.color;
      g.lineWidth = op.size * (this.canvas.width / 1200);
      g.beginPath();
      g.moveTo(op.a.x, op.a.y);
      g.lineTo(op.b.x, op.b.y);
      g.stroke();
      if (op.t === 'arrow') {
        const ang = Math.atan2(op.b.y - op.a.y, op.b.x - op.a.x);
        const L = 14 + op.size * 2;
        g.beginPath();
        g.moveTo(op.b.x, op.b.y);
        g.lineTo(op.b.x - L * Math.cos(ang - 0.4), op.b.y - L * Math.sin(ang - 0.4));
        g.moveTo(op.b.x, op.b.y);
        g.lineTo(op.b.x - L * Math.cos(ang + 0.4), op.b.y - L * Math.sin(ang + 0.4));
        g.stroke();
      }
    } else if (op.t === 'rect') {
      g.strokeStyle = op.color;
      g.lineWidth = op.size * (this.canvas.width / 1200);
      g.strokeRect(Math.min(op.a.x, op.b.x), Math.min(op.a.y, op.b.y), Math.abs(op.b.x - op.a.x), Math.abs(op.b.y - op.a.y));
    } else if (op.t === 'circle') {
      g.strokeStyle = op.color;
      g.lineWidth = op.size * (this.canvas.width / 1200);
      const cx = (op.a.x + op.b.x) / 2;
      const cy = (op.a.y + op.b.y) / 2;
      g.beginPath();
      g.ellipse(cx, cy, Math.abs(op.b.x - op.a.x) / 2, Math.abs(op.b.y - op.a.y) / 2, 0, 0, Math.PI * 2);
      g.stroke();
    } else if (op.t === 'text') {
      g.fillStyle = op.color;
      g.font = `600 ${op.size * (this.canvas.width / 1200)}px Vazirmatn, Tahoma, sans-serif`;
      g.fillText(op.text, op.x, op.y);
    }
    g.restore();
  }
}
