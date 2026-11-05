/*
 * PHANTOM ULTRA — offline software renderer for the promo reel.
 *
 * Rasterises the *exact* geometry that ships in the Ultra Pack (same PartMesh
 * data the GLB writer exports) with a deferred-ish forward PBR pipeline:
 *   shadow map + GGX specular on 3 analytic lights + equirect image-based
 *   ambient/reflection + normal mapping + emissive + ACES tonemap + bloom +
 *   vignette + grain.
 *
 * No GPU, no libraries. Usage:
 *   render <bundle.psc> <shot> <first-frame> <frame-count> <w> <h> <out.raw>
 *
 * The raw file holds frame-count RGB24 frames (w*h*3 bytes each), which the
 * Python driver post-processes (titles, transitions) and encodes with ffmpeg.
 */
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PI 3.14159265358979f
#define MAXPARTS 64

/* ------------------------------------------------------------------ math */
typedef struct { float m[4][4]; } mat4;

static mat4 mat_identity(void) {
  mat4 r; memset(&r, 0, sizeof r);
  r.m[0][0] = r.m[1][1] = r.m[2][2] = r.m[3][3] = 1.0f;
  return r;
}
static mat4 mat_mul(mat4 a, mat4 b) {
  mat4 r; memset(&r, 0, sizeof r);
  for (int i = 0; i < 4; i++)
    for (int j = 0; j < 4; j++) {
      float s = 0;
      for (int k = 0; k < 4; k++) s += a.m[i][k] * b.m[k][j];
      r.m[i][j] = s;
    }
  return r;
}
static void mat_point(mat4 m, const float v[3], float out[4]) {
  out[0] = m.m[0][0] * v[0] + m.m[0][1] * v[1] + m.m[0][2] * v[2] + m.m[0][3];
  out[1] = m.m[1][0] * v[0] + m.m[1][1] * v[1] + m.m[1][2] * v[2] + m.m[1][3];
  out[2] = m.m[2][0] * v[0] + m.m[2][1] * v[1] + m.m[2][2] * v[2] + m.m[2][3];
  out[3] = m.m[3][0] * v[0] + m.m[3][1] * v[1] + m.m[3][2] * v[2] + m.m[3][3];
}
static void mat_dir(mat4 m, const float v[3], float out[3]) {
  out[0] = m.m[0][0] * v[0] + m.m[0][1] * v[1] + m.m[0][2] * v[2];
  out[1] = m.m[1][0] * v[0] + m.m[1][1] * v[1] + m.m[1][2] * v[2];
  out[2] = m.m[2][0] * v[0] + m.m[2][1] * v[1] + m.m[2][2] * v[2];
}
static mat4 mat_translate(float x, float y, float z) {
  mat4 r = mat_identity(); r.m[0][3] = x; r.m[1][3] = y; r.m[2][3] = z; return r;
}
static mat4 mat_scale(float x, float y, float z) {
  mat4 r = mat_identity(); r.m[0][0] = x; r.m[1][1] = y; r.m[2][2] = z; return r;
}
static mat4 mat_rotx(float a) {
  mat4 r = mat_identity(); float c = cosf(a), s = sinf(a);
  r.m[1][1] = c; r.m[1][2] = -s; r.m[2][1] = s; r.m[2][2] = c; return r;
}
static mat4 mat_roty(float a) {
  mat4 r = mat_identity(); float c = cosf(a), s = sinf(a);
  r.m[0][0] = c; r.m[0][2] = s; r.m[2][0] = -s; r.m[2][2] = c; return r;
}
static mat4 mat_rotz(float a) {
  mat4 r = mat_identity(); float c = cosf(a), s = sinf(a);
  r.m[0][0] = c; r.m[0][1] = -s; r.m[1][0] = s; r.m[1][1] = c; return r;
}
static void v3sub(const float a[3], const float b[3], float o[3]) { o[0]=a[0]-b[0]; o[1]=a[1]-b[1]; o[2]=a[2]-b[2]; }
static void v3add(const float a[3], const float b[3], float o[3]) { o[0]=a[0]+b[0]; o[1]=a[1]+b[1]; o[2]=a[2]+b[2]; }
static void v3scale(const float a[3], float s, float o[3]) { o[0]=a[0]*s; o[1]=a[1]*s; o[2]=a[2]*s; }
static float v3dot(const float a[3], const float b[3]) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
static void v3cross(const float a[3], const float b[3], float o[3]) {
  o[0]=a[1]*b[2]-a[2]*b[1]; o[1]=a[2]*b[0]-a[0]*b[2]; o[2]=a[0]*b[1]-a[1]*b[0];
}
static float v3len(const float a[3]) { return sqrtf(v3dot(a,a)); }
static void v3norm(float a[3]) { float l = v3len(a); if (l > 1e-9f) { a[0]/=l; a[1]/=l; a[2]/=l; } }
static float clampf(float v, float a, float b) { return v < a ? a : (v > b ? b : v); }
static float mixf(float a, float b, float t) { return a + (b - a) * t; }
static float smoothstepf(float e0, float e1, float x) {
  float t = clampf((x - e0) / (e1 - e0 + 1e-9f), 0.f, 1.f); return t * t * (3.f - 2.f * t);
}

static mat4 mat_lookat(const float eye[3], const float at[3], const float up[3]) {
  float f[3], s[3], u[3];
  v3sub(at, eye, f); v3norm(f);
  v3cross(f, up, s); v3norm(s);
  v3cross(s, f, u);
  mat4 r = mat_identity();
  r.m[0][0]=s[0]; r.m[0][1]=s[1]; r.m[0][2]=s[2]; r.m[0][3]=-v3dot(s,eye);
  r.m[1][0]=u[0]; r.m[1][1]=u[1]; r.m[1][2]=u[2]; r.m[1][3]=-v3dot(u,eye);
  r.m[2][0]=-f[0]; r.m[2][1]=-f[1]; r.m[2][2]=-f[2]; r.m[2][3]=v3dot(f,eye);
  return r;
}
static mat4 mat_perspective(float fovy_deg, float aspect, float n, float f) {
  float t = 1.0f / tanf(fovy_deg * PI / 360.0f);
  mat4 r; memset(&r, 0, sizeof r);
  r.m[0][0] = t / aspect; r.m[1][1] = t;
  r.m[2][2] = (f + n) / (n - f); r.m[2][3] = (2 * f * n) / (n - f);
  r.m[3][2] = -1.0f;
  return r;
}
static mat4 mat_ortho(float l, float r_, float b, float t, float n, float f) {
  mat4 r = mat_identity();
  r.m[0][0] = 2/(r_-l); r.m[0][3] = -(r_+l)/(r_-l);
  r.m[1][1] = 2/(t-b);   r.m[1][3] = -(t+b)/(t-b);
  r.m[2][2] = -2/(f-n);  r.m[2][3] = -(f+n)/(f-n);
  return r;
}

/* ------------------------------------------------------------------ bundle */
typedef struct { int w, h, srgb; unsigned char *px; } Tex;
typedef struct { int albedo, normal, mr, emissive; float emis_scale, base[4], normal_strength; int blend; } Mat;
typedef struct { int mat; int nv, ni; float *pos, *nrm, *uv; unsigned int *idx; } Part;
typedef struct { int nparts; Part parts[MAXPARTS]; } Model;

static int g_ntex, g_nmat, g_nmodel;
static Tex *g_tex; static Mat *g_mat; static Model *g_model;

static void die(const char *m) { fprintf(stderr, "fatal: %s\n", m); exit(1); }

static void load_bundle(const char *path) {
  FILE *f = fopen(path, "rb");
  if (!f) die("cannot open bundle");
  char magic[4];
  if (fread(magic, 1, 4, f) != 4 || memcmp(magic, "PSC2", 4)) die("bad bundle magic");
  int32_t n;
  fread(&n, 4, 1, f); g_ntex = n;
  g_tex = calloc(n, sizeof(Tex));
  for (int i = 0; i < n; i++) {
    int32_t w, h, srgb;
    fread(&w, 4, 1, f); fread(&h, 4, 1, f); fread(&srgb, 4, 1, f);
    g_tex[i].w = w; g_tex[i].h = h; g_tex[i].srgb = srgb;
    g_tex[i].px = malloc((size_t)w * h * 4);
    fread(g_tex[i].px, 1, (size_t)w * h * 4, f);
  }
  fread(&n, 4, 1, f); g_nmat = n;
  g_mat = calloc(n, sizeof(Mat));
  for (int i = 0; i < n; i++) {
    fread(&g_mat[i].albedo, 4, 1, f); fread(&g_mat[i].normal, 4, 1, f);
    fread(&g_mat[i].mr, 4, 1, f); fread(&g_mat[i].emissive, 4, 1, f);
    fread(&g_mat[i].emis_scale, 4, 1, f);
    fread(g_mat[i].base, 4, 4, f);
    fread(&g_mat[i].normal_strength, 4, 1, f);
    fread(&g_mat[i].blend, 4, 1, f);
  }
  fread(&n, 4, 1, f); g_nmodel = n;
  g_model = calloc(n, sizeof(Model));
  for (int i = 0; i < n; i++) {
    int32_t np;
    fread(&np, 4, 1, f);
    if (np > MAXPARTS) die("too many parts");
    g_model[i].nparts = np;
    for (int p = 0; p < np; p++) {
      Part *pt = &g_model[i].parts[p];
      int32_t mat, nv, ni;
      fread(&mat, 4, 1, f); fread(&nv, 4, 1, f); fread(&ni, 4, 1, f);
      pt->mat = mat; pt->nv = nv; pt->ni = ni;
      pt->pos = malloc(sizeof(float) * 3 * nv);
      pt->nrm = malloc(sizeof(float) * 3 * nv);
      pt->uv = malloc(sizeof(float) * 2 * nv);
      pt->idx = malloc(sizeof(unsigned int) * ni);
      fread(pt->pos, sizeof(float), (size_t)3 * nv, f);
      fread(pt->nrm, sizeof(float), (size_t)3 * nv, f);
      fread(pt->uv, sizeof(float), (size_t)2 * nv, f);
      fread(pt->idx, sizeof(unsigned int), ni, f);
    }
  }
  fclose(f);
  fprintf(stderr, "bundle: %d textures, %d materials, %d models\n", g_ntex, g_nmat, g_nmodel);
}

/* ------------------------------------------------------------------ texture sampling */
static void tex_sample(const Tex *t, float u, float v, float out[4]) {
  u = u - floorf(u); v = v - floorf(v);
  float x = u * t->w - 0.5f, y = v * t->h - 0.5f;
  int x0 = (int)floorf(x), y0 = (int)floorf(y);
  float fx = x - x0, fy = y - y0;
  int x1 = (x0 + 1) % t->w; if (x1 < 0) x1 += t->w;
  int y1 = (y0 + 1) % t->h; if (y1 < 0) y1 += t->h;
  x0 = ((x0 % t->w) + t->w) % t->w; y0 = ((y0 % t->h) + t->h) % t->h;
  const unsigned char *p00 = t->px + ((size_t)y0 * t->w + x0) * 4;
  const unsigned char *p10 = t->px + ((size_t)y0 * t->w + x1) * 4;
  const unsigned char *p01 = t->px + ((size_t)y1 * t->w + x0) * 4;
  const unsigned char *p11 = t->px + ((size_t)y1 * t->w + x1) * 4;
  for (int c = 0; c < 4; c++) {
    float a = p00[c] + (p10[c] - p00[c]) * fx;
    float b = p01[c] + (p11[c] - p01[c]) * fx;
    out[c] = (a + (b - a) * fy) / 255.0f;
  }
  if (t->srgb) {
    for (int c = 0; c < 3; c++) {
      float s = out[c];
      out[c] = s <= 0.04045f ? s / 12.92f : powf((s + 0.055f) / 1.055f, 2.4f);
    }
  }
}

/* 4-tap box prefilter: kills the speckle you get sampling a 1k normal map on a
   1080-wide render without mipmaps (the renderer has no texture LOD chain). */
static void tex_sample_f(const Tex *t, float u, float v, float out[4]) {
  float du = 1.35f / t->w, dv = 1.35f / t->h;
  float a[4], b[4], c[4], d[4];
  tex_sample(t, u - du, v - dv, a); tex_sample(t, u + du, v - dv, b);
  tex_sample(t, u - du, v + dv, c); tex_sample(t, u + du, v + dv, d);
  for (int i = 0; i < 4; i++) out[i] = (a[i] + b[i] + c[i] + d[i]) * 0.25f;
}

static int g_sky = -1;
static void sample_sky(const float d[3], float out[3]) {
  if (g_sky < 0) { out[0] = out[1] = out[2] = 0.02f; return; }
  float u = atan2f(d[2], d[0]) / (2 * PI) + 0.5f;
  float v = acosf(clampf(d[1], -1.f, 1.f)) / PI;
  float c[4]; tex_sample_f(&g_tex[g_sky], u, v, c);
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
}

/* ------------------------------------------------------------------ framebuffer */
typedef struct {
  int w, h;
  float *color;      /* rgb float linear */
  float *depth;      /* view depth */
  float *normal;     /* world normal rgb (for bloom/SS effects) */
  unsigned char *mask;
} Framebuffer;

static Framebuffer fb_alloc(int w, int h) {
  Framebuffer fb;
  fb.w = w; fb.h = h;
  fb.color = calloc((size_t)w * h * 3, sizeof(float));
  fb.depth = malloc((size_t)w * h * sizeof(float));
  fb.normal = calloc((size_t)w * h * 3, sizeof(float));
  fb.mask = calloc((size_t)w * h, 1);
  for (int i = 0; i < w * h; i++) fb.depth[i] = 1e30f;
  return fb;
}

/* ------------------------------------------------------------------ lights */
typedef struct { float dir[3], color[3]; } Light;
static Light g_lights[3];
static float g_ambient[3] = {0.06f, 0.07f, 0.10f};

/* shadow map */
static int SHW = 1024, SHH = 1024;
static float *g_shadow;
static mat4 g_lightvp;

static float g_campos[3];
static int g_model_index_for(int slot);

/* ------------------------------------------------------------------ raster */
typedef struct { float x, y, z, invw; } VOut;
typedef struct {
  float wpos[3], nrm[3], uv[2];
} VAttr;

#define MAXVERT 200000
static VAttr g_va[MAXVERT];
static VOut g_vo[MAXVERT];

static void raster_tri(Framebuffer *fb, int i0, int i1, int i2, int mat, mat4 vp,
                       int shadow_pass, int additive_pass, float additive_color[3]) {
  VOut a = g_vo[i0], b = g_vo[i1], c = g_vo[i2];
  if (a.invw <= 0 || b.invw <= 0 || c.invw <= 0) return;
  float area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  if (fabsf(area) < 1e-7f) return;
  int minx = (int)floorf(fminf(a.x, fminf(b.x, c.x)));
  int maxx = (int)ceilf(fmaxf(a.x, fmaxf(b.x, c.x)));
  int miny = (int)floorf(fminf(a.y, fminf(b.y, c.y)));
  int maxy = (int)ceilf(fmaxf(a.y, fmaxf(b.y, c.y)));
  if (minx < 0) minx = 0; if (miny < 0) miny = 0;
  if (maxx > fb->w - 1) maxx = fb->w - 1;
  if (maxy > fb->h - 1) maxy = fb->h - 1;
  if (minx > maxx || miny > maxy) return;

  VAttr A = g_va[i0], B = g_va[i1], C = g_va[i2];
  float inv = 1.0f / area;
  Mat M = g_mat[mat];

  /* world-space tangent frame from uv derivatives */
  float e1[3], e2[3], d1[3], d2[3], T[3], Bt[3], N[3];
  v3sub(B.wpos, A.wpos, e1); v3sub(C.wpos, A.wpos, e2);
  v3sub(B.nrm, A.nrm, d1); v3sub(C.nrm, A.nrm, d2);
  float du1 = B.uv[0] - A.uv[0], dv1 = B.uv[1] - A.uv[1];
  float du2 = C.uv[0] - A.uv[0], dv2 = C.uv[1] - A.uv[1];
  float det = du1 * dv2 - du2 * dv1;
  if (fabsf(det) < 1e-12f) det = 1e-12f;
  float r = 1.0f / det;
  (void)d1; (void)d2;
  T[0] = (e1[0] * dv2 - e2[0] * dv1) * r;
  T[1] = (e1[1] * dv2 - e2[1] * dv1) * r;
  T[2] = (e1[2] * dv2 - e2[2] * dv1) * r;
  Bt[0] = (e2[0] * du1 - e1[0] * du2) * r;
  Bt[1] = (e2[1] * du1 - e1[1] * du2) * r;
  Bt[2] = (e2[2] * du1 - e1[2] * du2) * r;
  v3norm(T);

  for (int y = miny; y <= maxy; y++) {
    for (int x = minx; x <= maxx; x++) {
      float px = x + 0.5f, py = y + 0.5f;
      float w0 = ((b.x - px) * (c.y - py) - (c.x - px) * (b.y - py)) * inv;
      float w1 = ((c.x - px) * (a.y - py) - (a.x - px) * (c.y - py)) * inv;
      float w2 = 1.0f - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      float z = w0 * a.z + w1 * b.z + w2 * c.z;
      int pi = y * fb->w + x;
      if (z >= fb->depth[pi]) continue;
      /* perspective-correct attribute interpolation */
      float iw = w0 * a.invw + w1 * b.invw + w2 * c.invw;
      float f0 = w0 * a.invw / iw, f1 = w1 * b.invw / iw, f2 = w2 * c.invw / iw;
      float wpos[3], nrm[3], uv[2];
      for (int k = 0; k < 3; k++) {
        wpos[k] = A.wpos[k] * f0 + B.wpos[k] * f1 + C.wpos[k] * f2;
        nrm[k] = A.nrm[k] * f0 + B.nrm[k] * f1 + C.nrm[k] * f2;
      }
      uv[0] = A.uv[0] * f0 + B.uv[0] * f1 + C.uv[0] * f2;
      uv[1] = A.uv[1] * f0 + B.uv[1] * f1 + C.uv[1] * f2;

      if (shadow_pass) { fb->depth[pi] = z; continue; }
      if (additive_pass) {
        fb->color[pi * 3 + 0] += additive_color[0];
        fb->color[pi * 3 + 1] += additive_color[1];
        fb->color[pi * 3 + 2] += additive_color[2];
        continue;
      }

      v3norm(nrm);
      float V[3];
      v3sub(g_campos, wpos, V); float dist = v3len(V); v3norm(V);
      if (v3dot(nrm, V) < 0.0f) { nrm[0] = -nrm[0]; nrm[1] = -nrm[1]; nrm[2] = -nrm[2]; }

      /* normal mapping */
      float nsamp[4] = {0.5f, 0.5f, 1.0f, 1.0f};
      if (M.normal >= 0) tex_sample_f(&g_tex[M.normal], uv[0], uv[1], nsamp);
      if (M.normal_strength != 1.0f) {
        nsamp[0] = (nsamp[0] - 0.5f) * M.normal_strength + 0.5f;
        nsamp[1] = (nsamp[1] - 0.5f) * M.normal_strength + 0.5f;
      }
      if (M.normal >= 0) {
        float tn[3] = {nsamp[0] * 2.f - 1.f, nsamp[1] * 2.f - 1.f, nsamp[2] * 2.f - 1.f};
        float b2[3];
        v3cross(nrm, T, b2);
        float tl = v3len(b2);
        if (tl > 1e-6f) {
          v3scale(b2, 1.f / tl, b2);
          float nn[3];
          for (int k = 0; k < 3; k++) nn[k] = T[k] * tn[0] + b2[k] * tn[1] + nrm[k] * tn[2];
          v3norm(nn);
          nrm[0] = nn[0]; nrm[1] = nn[1]; nrm[2] = nn[2];
        }
      }

      float alb[4] = {M.base[0], M.base[1], M.base[2], 1.f};
      if (M.albedo >= 0) tex_sample_f(&g_tex[M.albedo], uv[0], uv[1], alb);
      float mrs[4] = {1.f, 1.f, 1.f, 1.f};
      if (M.mr >= 0) tex_sample_f(&g_tex[M.mr], uv[0], uv[1], mrs);
      float emis[4] = {0, 0, 0, 0};
      if (M.emissive >= 0) tex_sample_f(&g_tex[M.emissive], uv[0], uv[1], emis);
      float rough = clampf(mrs[1], 0.03f, 1.f);
      float metal = clampf(mrs[2], 0.f, 1.f);

      float basec[3] = {alb[0] * M.base[0], alb[1] * M.base[1], alb[2] * M.base[2]};
      float diffuse[3] = {basec[0] * (1 - metal), basec[1] * (1 - metal), basec[2] * (1 - metal)};
      float F0[3] = {mixf(0.04f, basec[0], metal), mixf(0.04f, basec[1], metal), mixf(0.04f, basec[2], metal)};

      float col[3] = {0, 0, 0};

      /* ambient / image based */
      float irr[3];
      sample_sky(nrm, irr);
      float R[3];
      float ndv = fmaxf(v3dot(nrm, V), 0.0f);
      for (int k = 0; k < 3; k++) R[k] = 2.f * ndv * nrm[k] - V[k];
      v3norm(R);
      float refl[3];
      sample_sky(R, refl);
      float fres = powf(1.f - ndv, 5.f);
      float spec_amb = 0.35f + 0.65f * (1.f - rough);
      for (int k = 0; k < 3; k++) {
        col[k] += diffuse[k] * irr[k] * 0.30f;
        float f = F0[k] + (1.f - F0[k]) * fres;
        col[k] += refl[k] * f * spec_amb * (metal > 0.5f ? 0.85f : 0.42f);
        col[k] += g_ambient[k] * basec[k] * 0.6f;
      }

      /* analytic lights with GGX */
      for (int li = 0; li < 3; li++) {
        float L[3] = {-g_lights[li].dir[0], -g_lights[li].dir[1], -g_lights[li].dir[2]};
        v3norm(L);
        float ndl = v3dot(nrm, L);
        if (ndl <= 0) continue;
        float shadow = 1.0f;
        if (li == 0 && g_shadow) {
          float lp[4];
          mat_point(g_lightvp, wpos, lp);
          float sx = (lp[0] * 0.5f + 0.5f) * SHW;
          float sy = (0.5f - lp[1] * 0.5f) * SHH;
          float lz = lp[2] * 0.5f + 0.5f;
          float bias = 0.0045f + 0.010f * (1 - ndl);
          float sum = 0; int cnt = 0;
          for (int oy = -1; oy <= 1; oy++)
            for (int ox = -1; ox <= 1; ox++) {
              int px2 = (int)sx + ox, py2 = (int)sy + oy;
              if (px2 < 0 || py2 < 0 || px2 >= SHW || py2 >= SHH) { sum += 1; cnt++; continue; }
              float d = g_shadow[py2 * SHW + px2];
              sum += (lz - bias > d) ? 0.0f : 1.0f;
              cnt++;
            }
          shadow = sum / (float)cnt;
          shadow = 0.25f + 0.75f * shadow;
        }
        float H[3] = {L[0] + V[0], L[1] + V[1], L[2] + V[2]};
        v3norm(H);
        float ndh = fmaxf(v3dot(nrm, H), 0.f);
        float vdh = fmaxf(v3dot(V, H), 0.f);
        float a2 = rough * rough * rough * rough;
        float dd = ndh * ndh * (a2 - 1.f) + 1.f;
        float D = a2 / (PI * dd * dd + 1e-7f);
        float k = (rough + 1.f) * (rough + 1.f) / 8.f;
        float G = (ndl / (ndl * (1 - k) + k)) * (ndv / (ndv * (1 - k) + k));
        for (int c2 = 0; c2 < 3; c2++) {
          float F = F0[c2] + (1.f - F0[c2]) * powf(1.f - vdh, 5.f);
          float spec = D * G * F / (4.f * ndl * ndv + 1e-5f);
          float inten = g_lights[li].color[c2];
          col[c2] += (diffuse[c2] / PI * 1.1f + spec) * inten * ndl * shadow * 9.0f;
        }
      }

      /* rim glow + emissive */
      for (int k = 0; k < 3; k++) col[k] += emis[k] * M.emis_scale * 2.2f;

      /* atmospheric depth fade towards the sky colour */
      float fog = 1.f - expf(-dist * 0.035f);
      float skyc[3]; sample_sky((float[3]){0.f, 0.f, -1.f}, skyc);
      float fogt = fog * 0.55f;
      for (int k = 0; k < 3; k++) col[k] = mixf(col[k], skyc[k] * 0.9f, fogt);

      float alpha = M.blend ? alb[3] : 1.0f;
      if (M.blend) {
        fb->color[pi * 3 + 0] = mixf(fb->color[pi * 3 + 0], col[0], alpha);
        fb->color[pi * 3 + 1] = mixf(fb->color[pi * 3 + 1], col[1], alpha);
        fb->color[pi * 3 + 2] = mixf(fb->color[pi * 3 + 2], col[2], alpha);
      } else {
        fb->color[pi * 3 + 0] = col[0];
        fb->color[pi * 3 + 1] = col[1];
        fb->color[pi * 3 + 2] = col[2];
        fb->depth[pi] = z;
        fb->normal[pi * 3 + 0] = nrm[0];
        fb->normal[pi * 3 + 1] = nrm[1];
        fb->normal[pi * 3 + 2] = nrm[2];
        fb->mask[pi] = 1;
      }
    }
  }
}

/* ------------------------------------------------------------------ scene draw */
static void draw_model(Framebuffer *fb, int model_id, mat4 model, mat4 vp, int shadow_pass) {
  Model *M = &g_model[model_id];
  int vbase = 0;
  for (int p = 0; p < M->nparts; p++) {
    Part *pt = &M->parts[p];
    if (g_mat[pt->mat].blend && shadow_pass) continue;
    for (int i = 0; i < pt->nv; i++) {
      float wp[4], wn[3];
      mat_point(model, &pt->pos[i * 3], wp);
      mat_dir(model, &pt->nrm[i * 3], wn);
      v3norm(wn);
      float cp[4];
      mat_point(vp, wp, cp);
      VOut *o = &g_vo[vbase + i];
      o->invw = 1.0f / fmaxf(cp[3], 1e-6f);
      o->x = (cp[0] * o->invw * 0.5f + 0.5f) * fb->w;
      o->y = (0.5f - cp[1] * o->invw * 0.5f) * fb->h;
      o->z = cp[2] * o->invw;
      VAttr *a = &g_va[vbase + i];
      a->wpos[0] = wp[0]; a->wpos[1] = wp[1]; a->wpos[2] = wp[2];
      a->nrm[0] = wn[0]; a->nrm[1] = wn[1]; a->nrm[2] = wn[2];
      a->uv[0] = pt->uv[i * 2]; a->uv[1] = pt->uv[i * 2 + 1];
    }
    for (int i = 0; i < pt->ni; i += 3) {
      raster_tri(fb, vbase + pt->idx[i], vbase + pt->idx[i + 1], vbase + pt->idx[i + 2],
                 pt->mat, vp, shadow_pass, 0, NULL);
    }
    vbase += pt->nv;
    if (vbase > MAXVERT - 8) { fprintf(stderr, "vertex overflow\n"); exit(1); }
  }
}

/* additive screen-space glow (muzzle flash, sparks) */
static void draw_glow(Framebuffer *fb, float x, float y, float radius, const float color[3], float falloff) {
  int minx = (int)(x - radius), maxx = (int)(x + radius);
  int miny = (int)(y - radius), maxy = (int)(y + radius);
  if (minx < 0) minx = 0; if (miny < 0) miny = 0;
  if (maxx >= fb->w) maxx = fb->w - 1; if (maxy >= fb->h) maxy = fb->h - 1;
  for (int py = miny; py <= maxy; py++)
    for (int px = minx; px <= maxx; px++) {
      float dx = (px + 0.5f - x) / radius, dy = (py + 0.5f - y) / radius;
      float d2 = dx * dx + dy * dy;
      if (d2 > 1.f) continue;
      float g = powf(1.f - sqrtf(d2), falloff);
      int pi = py * fb->w + px;
      fb->color[pi * 3 + 0] += color[0] * g;
      fb->color[pi * 3 + 1] += color[1] * g;
      fb->color[pi * 3 + 2] += color[2] * g;
    }
}

/* ------------------------------------------------------------------ post */
static float aces(float x) {
  float a = 2.51f, b = 0.03f, c = 2.43f, d = 0.59f, e = 0.14f;
  return clampf((x * (a * x + b)) / (x * (c * x + d) + e), 0.f, 1.f);
}

static void post_process(Framebuffer *fb, unsigned char *out, int frame_seed,
                         float exposure, float bloom_amount, float grain, float vignette_strength,
                         float ca) {
  int w = fb->w, h = fb->h;
  /* bright pass + box blur at 1/4 res, 3 passes */
  int bw = w / 4 + 1, bh = h / 4 + 1;
  float *bright = calloc((size_t)bw * bh * 3, sizeof(float));
  float *tmp = calloc((size_t)bw * bh * 3, sizeof(float));
  for (int y = 0; y < bh; y++)
    for (int x = 0; x < bw; x++) {
      float acc[3] = {0, 0, 0};
      int n = 0;
      for (int oy = 0; oy < 4; oy++)
        for (int ox = 0; ox < 4; ox++) {
          int sx = x * 4 + ox, sy = y * 4 + oy;
          if (sx >= w || sy >= h) continue;
          for (int c = 0; c < 3; c++) acc[c] += fb->color[(sy * w + sx) * 3 + c];
          n++;
        }
      for (int c = 0; c < 3; c++) {
        float v = acc[c] / (float)n;
        v = fmaxf(v - 1.05f, 0.f);
        bright[(y * bw + x) * 3 + c] = v;
      }
    }
  float kernel[9] = {0.0625f, 0.125f, 0.0625f, 0.125f, 0.25f, 0.125f, 0.0625f, 0.125f, 0.0625f};
  for (int pass = 0; pass < 3; pass++) {
    for (int y = 0; y < bh; y++)
      for (int x = 0; x < bw; x++)
        for (int c = 0; c < 3; c++) {
          float s = 0;
          for (int ky = -1; ky <= 1; ky++)
            for (int kx = -1; kx <= 1; kx++) {
              int sx = x + kx * (pass + 1), sy = y + ky * (pass + 1);
              if (sx < 0) sx = 0; if (sy < 0) sy = 0;
              if (sx >= bw) sx = bw - 1; if (sy >= bh) sy = bh - 1;
              s += bright[(sy * bw + sx) * 3 + c] * kernel[(ky + 1) * 3 + kx + 1];
            }
          tmp[(y * bw + x) * 3 + c] = s;
        }
    memcpy(bright, tmp, (size_t)bw * bh * 3 * sizeof(float));
  }

  for (int y = 0; y < h; y++) {
    for (int x = 0; x < w; x++) {
      int pi = y * w + x;
      float u = (x + 0.5f) / w, v = (y + 0.5f) / h;
      float dx = u - 0.5f, dy = v - 0.5f;
      float r2 = dx * dx + dy * dy;
      float shift = ca * r2;
      float col[3];
      for (int c = 0; c < 3; c++) {
        int sx = x + (int)(dx * shift * w * (c - 1) * 2.f);
        int sy = y + (int)(dy * shift * h * (c - 1) * 2.f);
        sx = sx < 0 ? 0 : (sx >= w ? w - 1 : sx);
        sy = sy < 0 ? 0 : (sy >= h ? h - 1 : sy);
        col[c] = fb->color[(sy * w + sx) * 3 + c];
      }
      float bl[3];
      int bx = x / 4, by = y / 4;
      if (bx >= bw) bx = bw - 1; if (by >= bh) by = bh - 1;
      for (int c = 0; c < 3; c++) bl[c] = bright[(by * bw + bx) * 3 + c];
      float vig = 1.f - vignette_strength * smoothstepf(0.22f, 0.85f, sqrtf(r2) * 1.62f);
      float n = 0;
      if (grain > 0) {
        unsigned int s = (unsigned int)(frame_seed * 2654435761u) ^ (unsigned int)((x * 73856093) ^ (y * 19349663));
        s ^= s >> 13; s *= 1274126177u; s ^= s >> 16;
        n = ((float)(s & 0xffff) / 65535.f - 0.5f);
      }
      for (int c = 0; c < 3; c++) {
        float v2 = (col[c] + bl[c] * bloom_amount) * exposure;
        v2 = aces(v2);
        v2 = powf(v2, 1.f / 2.2f);
        v2 = v2 * vig + n * grain;
        int iv = (int)(clampf(v2, 0.f, 1.f) * 255.f + 0.5f);
        out[(size_t)pi * 3 + c] = (unsigned char)iv;
      }
    }
  }
  free(bright); free(tmp);
}

/* ------------------------------------------------------------------ shots */
typedef struct { float eye[3], at[3], fovy, exposure; } Cam;
typedef struct { int slot; mat4 m; } Inst;
#define MAXINST 32

static int g_shot;
static float g_t01;
static int g_slots[8];
static int g_model_index_for(int slot) { return g_slots[slot]; }

static float g_cam_fwd[3], g_cam_right[3], g_cam_up[3], g_tanhalf = 0.3f, g_aspect = 1.0f;

static void render_sky(Framebuffer *fb) {
  for (int y = 0; y < fb->h; y++) {
    float ndy = 1.f - (y + 0.5f) / fb->h * 2.f;
    for (int x = 0; x < fb->w; x++) {
      float ndx = (x + 0.5f) / fb->w * 2.f - 1.f;
      float dir[3];
      for (int k = 0; k < 3; k++)
        dir[k] = g_cam_fwd[k] + g_cam_right[k] * (ndx * g_tanhalf * g_aspect) + g_cam_up[k] * (ndy * g_tanhalf);
      v3norm(dir);
      float c[3];
      sample_sky(dir, c);
      float *px = &fb->color[((size_t)y * fb->w + x) * 3];
      px[0] = c[0] * 0.22f; px[1] = c[1] * 0.22f; px[2] = c[2] * 0.22f;
    }
  }
}

static void glow_world(Framebuffer *fb, mat4 vp, const float p[3], float radius, const float color[3], float falloff) {
  float cp[4];
  mat_point(vp, p, cp);
  if (cp[3] <= 0.01f) return;
  float sx = (cp[0] / cp[3] * 0.5f + 0.5f) * fb->w;
  float sy = (0.5f - cp[1] / cp[3] * 0.5f) * fb->h;
  draw_glow(fb, sx, sy, radius, color, falloff);
}

/* ---------------------------------------------------------------- scene per shot */
static int build_scene(Cam *cam, Inst *inst) {
  float t = g_t01;
  int n = 0;
  cam->fovy = 34.f; cam->exposure = 1.05f;

  /* default lighting rig: warm key, cyan fill, magenta rim */
  g_lights[0].dir[0] = -0.42f; g_lights[0].dir[1] = -0.72f; g_lights[0].dir[2] = -0.55f;
  g_lights[1].dir[0] = 0.85f;  g_lights[1].dir[1] = -0.20f; g_lights[1].dir[2] = -0.45f;
  g_lights[2].dir[0] = 0.15f;  g_lights[2].dir[1] = 0.30f;  g_lights[2].dir[2] = 0.94f;
  g_lights[0].color[0] = 3.0f; g_lights[0].color[1] = 2.75f; g_lights[0].color[2] = 2.35f;
  g_lights[1].color[0] = 0.22f; g_lights[1].color[1] = 0.80f; g_lights[1].color[2] = 1.5f;
  g_lights[2].color[0] = 1.7f; g_lights[2].color[1] = 0.25f; g_lights[2].color[2] = 1.1f;
  g_ambient[0] = 0.05f; g_ambient[1] = 0.06f; g_ambient[2] = 0.09f;

  switch (g_shot) {
    case 0: { /* hero — rifle held diagonally in a neon void, slow arc + push */
      float ang = -0.30f + t * 0.5f;
      cam->eye[0] = sinf(ang) * 1.85f; cam->eye[1] = 0.30f; cam->eye[2] = cosf(ang) * 1.85f;
      cam->at[0] = 0.f; cam->at[1] = -0.06f; cam->at[2] = -0.18f;
      cam->fovy = 31.f;
      inst[n].slot = 0;
      inst[n].m = mat_mul(mat_mul(mat_translate(0, -0.02f, -0.18f), mat_roty(0.55f)),
                          mat_mul(mat_rotz(0.42f), mat_roty(t * 0.20f)));
      n++;
      break;
    }
    case 1: { /* turntable — full 360 of the hero rifle */
      float ang = 0.25f + t * 2.6f;
      cam->eye[0] = sinf(ang) * 1.55f; cam->eye[1] = 0.22f + sinf(t * 3.f) * 0.03f; cam->eye[2] = cosf(ang) * 1.55f;
      cam->at[0] = 0.f; cam->at[1] = -0.04f; cam->at[2] = -0.22f;
      cam->fovy = 32.f;
      inst[n].slot = 0;
      inst[n].m = mat_mul(mat_mul(mat_translate(0, 0, -0.22f), mat_roty(0.4f + t * 6.2f)),
                          mat_rotz(0.30f));
      n++;
      g_lights[0].dir[1] = -0.95f + t * 0.35f;
      break;
    }
    case 2: { /* macro — gliding along the receiver, shows texel-level detail */
      float s = t;
      float ang2 = -0.15f + s * 0.55f;
      cam->eye[0] = sinf(ang2) * 0.78f; cam->eye[1] = 0.10f + s * 0.05f; cam->eye[2] = cosf(ang2) * 0.78f - 0.18f;
      cam->at[0] = 0.0f; cam->at[1] = 0.0f; cam->at[2] = -0.22f;
      cam->fovy = 34.f; cam->exposure = 1.05f;
      inst[n].slot = 0;
      inst[n].m = mat_mul(mat_translate(0, 0, -0.22f), mat_mul(mat_roty(0.5f), mat_rotz(0.28f)));
      n++;
      g_lights[0].dir[1] = -0.35f; g_lights[0].dir[0] = -0.85f;
      break;
    }
    case 3: { /* operator reveal, full body */
      float ang = 0.15f + t * 1.05f;
      cam->eye[0] = sinf(ang) * 3.55f; cam->eye[1] = 1.25f; cam->eye[2] = cosf(ang) * 3.55f;
      cam->at[0] = 0.f; cam->at[1] = 1.02f; cam->at[2] = 0.f;
      cam->fovy = 34.f; cam->exposure = 0.98f;
      inst[n].slot = 2; inst[n].m = mat_roty(0.35f + t * 0.5f); n++;
      break;
    }
    case 4: { /* muzzle flash + sparks */
      float ang = 0.75f + t * 0.35f;
      cam->eye[0] = sinf(ang) * 1.45f; cam->eye[1] = 0.18f; cam->eye[2] = cosf(ang) * 1.45f;
      cam->at[0] = 0.f; cam->at[1] = 0.0f; cam->at[2] = -0.40f;
      cam->fovy = 33.f; cam->exposure = 0.95f;
      float kick = 0.f;
      float phase = fmodf(t * 6.0f, 1.0f);
      if (phase < 0.10f) kick = (0.10f - phase) / 0.10f;
      inst[n].slot = 0;
      inst[n].m = mat_mul(mat_translate(0, 0, -0.40f + kick * 0.035f),
                          mat_mul(mat_roty(0.35f), mat_rotz(0.22f)));
      n++;
      break;
    }
    case 5: { /* props flythrough: crate + drone + pylon */
      float ang = -0.85f + t * 1.1f;
      cam->eye[0] = sinf(ang) * 5.4f; cam->eye[1] = 1.7f + t * 0.9f; cam->eye[2] = cosf(ang) * 5.4f;
      cam->at[0] = 1.0f; cam->at[1] = 1.35f; cam->at[2] = -0.6f;
      cam->fovy = 40.f; cam->exposure = 0.92f;
      inst[n].slot = 3; inst[n].m = mat_mul(mat_translate(-1.6f, 0, 0.4f), mat_roty(0.5f)); n++;
      inst[n].slot = 3; inst[n].m = mat_mul(mat_translate(-1.6f, 0.90f, 0.4f), mat_mul(mat_roty(-0.25f), mat_scale(0.8f, 0.8f, 0.8f))); n++;
      inst[n].slot = 4; inst[n].m = mat_translate(2.6f, 0, -2.2f); n++;
      inst[n].slot = 5;
      inst[n].m = mat_mul(mat_translate(0.4f, 2.05f + sinf(t * 4.f) * 0.12f, 0.2f), mat_roty(t * 4.f)); n++;
      break;
    }
    case 6: { /* upper-body close orbit, hard rim */
      float ang = 2.2f + t * 1.9f;
      cam->eye[0] = sinf(ang) * 1.55f; cam->eye[1] = 1.52f; cam->eye[2] = cosf(ang) * 1.55f;
      cam->at[0] = 0.f; cam->at[1] = 1.38f; cam->at[2] = 0.f;
      cam->fovy = 36.f; cam->exposure = 1.12f;
      inst[n].slot = 2; inst[n].m = mat_identity(); n++;
      g_lights[2].dir[0] = 0.9f; g_lights[2].dir[2] = 0.3f;
      break;
    }
    default: { /* finale — pylon + drone, slow push */
      float ang = 1.1f + t * 0.45f;
      cam->eye[0] = sinf(ang) * 9.5f; cam->eye[1] = 3.2f + t * 1.2f; cam->eye[2] = cosf(ang) * 9.5f;
      cam->at[0] = 0.f; cam->at[1] = 4.0f; cam->at[2] = 0.f;
      cam->fovy = 42.f; cam->exposure = 0.88f;
      inst[n].slot = 4; inst[n].m = mat_identity(); n++;
      inst[n].slot = 5;
      inst[n].m = mat_mul(mat_translate(sinf(t * 1.6f) * 2.4f, 5.6f + sinf(t * 3.f) * 0.3f, cosf(t * 1.6f) * 2.4f),
                          mat_roty(t * 3.f)); n++;
      break;
    }
  }
  return n;
}

int main(int argc, char **argv) {
  if (argc < 8) {
    fprintf(stderr, "usage: %s bundle shot f0 count w h out.raw [slotmap]\n", argv[0]);
    return 2;
  }
  load_bundle(argv[1]);
  g_shot = atoi(argv[2]);
  int f0 = atoi(argv[3]), count = atoi(argv[4]);
  int w = atoi(argv[5]), h = atoi(argv[6]);
  const char *out = argv[7];
  const char *map = argc > 8 ? argv[8] : "0,1,2,3,4,5";
  for (int i = 0; i < 8; i++) g_slots[i] = 0;
  {
    int s = 0; const char *p = map;
    while (*p && s < 8) {
      g_slots[s++] = atoi(p);
      while (*p && *p != ',') p++;
      if (*p == ',') p++;
    }
  }
  g_sky = g_ntex - 1;
  g_shadow = malloc(sizeof(float) * SHW * SHH);

  Framebuffer fb = fb_alloc(w, h);
  Framebuffer sb; memset(&sb, 0, sizeof sb);
  sb.w = SHW; sb.h = SHH; sb.depth = g_shadow;
  unsigned char *pixels = malloc((size_t)w * h * 3);
  FILE *fo = fopen(out, "wb");
  if (!fo) die("cannot open output");

  for (int f = 0; f < count; f++) {
    int frame = f0 + f;
    g_t01 = count > 1 ? (float)f / (float)(count - 1) : 0.f;
    Inst inst[MAXINST];
    Cam cam;
    int n = build_scene(&cam, inst);

    float up[3] = {0, 1, 0};
    mat4 view = mat_lookat(cam.eye, cam.at, up);
    mat4 proj = mat_perspective(cam.fovy, (float)w / (float)h, 0.02f, 160.f);
    mat4 vp = mat_mul(proj, view);
    memcpy(g_campos, cam.eye, sizeof g_campos);
    /* camera basis for the background pass */
    v3sub(cam.at, cam.eye, g_cam_fwd); v3norm(g_cam_fwd);
    v3cross(g_cam_fwd, up, g_cam_right); v3norm(g_cam_right);
    v3cross(g_cam_right, g_cam_fwd, g_cam_up);
    g_tanhalf = tanf(cam.fovy * PI / 360.f);
    g_aspect = (float)w / (float)h;

    /* clear */
    for (int i = 0; i < w * h; i++) {
      fb.depth[i] = 1e30f;
      fb.mask[i] = 0;
      fb.color[i * 3 + 0] = fb.color[i * 3 + 1] = fb.color[i * 3 + 2] = 0.f;
    }
    render_sky(&fb);

    /* shadow map from the key light */
    mat4 lview = mat_lookat((float[3]){-g_lights[0].dir[0] * 14.f, -g_lights[0].dir[1] * 14.f,
                                      -g_lights[0].dir[2] * 14.f},
                            (float[3]){0.f, 0.8f, 0.f}, up);
    mat4 lproj = mat_ortho(-7, 7, -7, 7, 0.5f, 40.f);
    g_lightvp = mat_mul(lproj, lview);
    for (int i = 0; i < SHW * SHH; i++) g_shadow[i] = 1e30f;
    for (int i = 0; i < n; i++) draw_model(&sb, g_model_index_for(inst[i].slot), inst[i].m, g_lightvp, 1);

    for (int i = 0; i < n; i++) draw_model(&fb, g_model_index_for(inst[i].slot), inst[i].m, vp, 0);

    /* muzzle flash + sparks */
    if (g_shot == 4) {
      float t = g_t01;
      float phase = fmodf(t * 6.0f, 1.0f);
      if (phase < 0.16f) {
        float k = 1.f - phase / 0.16f;
        float local[3] = {0.0f, 0.012f, -0.99f};
        float world[4];
        mat_point(inst[0].m, local, world);
        float flash[3] = {3.2f * k, 2.0f * k, 0.7f * k};
        glow_world(&fb, vp, world, 54.f * (0.6f + 0.7f * k), flash, 2.4f);
        float core[3] = {1.5f * k, 1.3f * k, 0.8f * k};
        glow_world(&fb, vp, world, 16.f * (0.5f + 0.9f * k), core, 1.2f);
        /* deterministic spark burst */
        unsigned int seed = 12345u;
        for (int sp = 0; sp < 46; sp++) {
          seed = seed * 1664525u + 1013904223u;
          float r1 = ((seed >> 8) & 0xffff) / 65535.f;
          seed = seed * 1664525u + 1013904223u;
          float r2 = ((seed >> 8) & 0xffff) / 65535.f;
          seed = seed * 1664525u + 1013904223u;
          float r3 = ((seed >> 8) & 0xffff) / 65535.f;
          float life = phase / 0.16f;
          float dist = r1 * 0.9f * life;
          float p[3] = {world[0] + (r2 - 0.5f) * 0.22f * life,
                        world[1] + (r3 - 0.5f) * 0.22f * life - life * life * 0.12f,
                        world[2] - dist};
          float c[3] = {3.2f * (1.f - life) * (0.6f + r1 * 0.8f), 1.7f * (1.f - life), 0.5f * (1.f - life)};
          glow_world(&fb, vp, p, 5.5f + r2 * 5.f, c, 1.6f);
        }
      }
    }

    post_process(&fb, pixels, frame, cam.exposure, 0.42f, 0.013f, 0.45f, 0.0014f);
    fwrite(pixels, 1, (size_t)w * h * 3, fo);
  }
  fclose(fo);
  free(pixels); free(fb.color); free(fb.depth); free(fb.normal); free(fb.mask);
  return 0;
}
