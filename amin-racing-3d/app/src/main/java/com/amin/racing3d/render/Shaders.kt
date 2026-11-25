package com.amin.racing3d.render

/** GLSL ES 3.00 shader sources. */
object Shaders {

    const val MAIN_VS = """#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aColor;
layout(location=3) in vec2 aMat;
layout(location=4) in vec2 aUv;
layout(location=5) in vec4 iM0;
layout(location=6) in vec4 iM1;
layout(location=7) in vec4 iM2;
layout(location=8) in vec4 iM3;
layout(location=9) in vec4 iTint;
layout(location=10) in vec4 iExtra;
uniform mat4 uViewProj;
uniform mat4 uLightVP;
uniform highp int uTexMode;
uniform vec2 uTexScale;
uniform float uBlink;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vColor;
out vec2 vUv;
out vec4 vShadowPos;
out float vEmis;
out float vSpec;
out float vAlpha;
void main() {
    mat4 m = mat4(iM0, iM1, iM2, iM3);
    vec4 w = m * vec4(aPos, 1.0);
    vWorld = w.xyz;
    vNormal = mat3(m) * aNormal;
    vColor = mix(aColor.rgb, aColor.rgb * iTint.rgb, aColor.a);
    vAlpha = iTint.a;
    float t = aMat.x;
    float e = 0.0;
    if (t > 0.5) {
        if (t < 1.5) e = iExtra.y;
        else if (t < 2.5) e = 0.22 + 0.45 * iExtra.y + 1.4 * iExtra.x;
        else if (t < 3.5) e = iExtra.z * uBlink * 1.8;
        else if (t < 4.5) e = iExtra.w * uBlink * 1.8;
        else e = 1.0;
    }
    vEmis = e;
    vSpec = aMat.y;
    if (uTexMode == 1) {
        vUv = vec2(aUv.x, -w.z / uTexScale.x);
    } else if (uTexMode == 2) {
        vUv = w.xz / uTexScale.x;
    } else if (uTexMode == 3) {
        float sx = length(iM0.xyz);
        float sy = length(iM1.xyz);
        float sz = length(iM2.xyz);
        float uw = abs(aNormal.x) > 0.5 ? sz : sx;
        vUv = vec2(aUv.x * uw / uTexScale.x, aUv.y * sy / uTexScale.y);
    } else {
        vUv = aUv;
    }
    vShadowPos = uLightVP * w;
    gl_Position = uViewProj * w;
}
"""

    const val MAIN_FS = """#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;
in vec2 vUv;
in vec4 vShadowPos;
in float vEmis;
in float vSpec;
in float vAlpha;
uniform sampler2D uTex;
uniform sampler2DShadow uShadowMap;
uniform highp int uTexMode;
uniform int uShadowOn;
uniform float uShadowTexel;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform vec3 uFogColor;
uniform vec3 uSkyTop;
uniform vec3 uCamPos;
uniform float uFogDensity;
uniform float uFogScale;
uniform float uNight;
uniform float uReflect;
uniform vec3 uHeadPos;
uniform vec3 uHeadDir;
uniform float uHeadOn;
uniform float uLampOn;
uniform float uLampSpacing;
uniform float uLampPhase;
uniform float uLampX;
uniform float uGlass;
uniform int uShadowSoft;
out vec4 fragColor;

float shadowFactor() {
    if (uShadowOn == 0) return 1.0;
    vec3 p = vShadowPos.xyz / vShadowPos.w;
    p = p * 0.5 + 0.5;
    if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
    float z = p.z - 0.0018;
    float t = uShadowTexel;
    if (uShadowSoft == 1) {
        // Ultra: 3x3 PCF (softer, less aliased edges)
        float s9 = 0.0;
        for (int i = -1; i <= 1; i++) {
            for (int j = -1; j <= 1; j++) {
                s9 += texture(uShadowMap, vec3(p.xy + vec2(float(i), float(j)) * t * 1.25, z));
            }
        }
        return s9 / 9.0;
    }
    float s = texture(uShadowMap, vec3(p.xy + vec2(-t, -t), z));
    s += texture(uShadowMap, vec3(p.xy + vec2(t, -t), z));
    s += texture(uShadowMap, vec3(p.xy + vec2(-t, t), z));
    s += texture(uShadowMap, vec3(p.xy + vec2(t, t), z));
    return s * 0.25;
}

void main() {
    vec3 albedo = vColor;
    float spec = vSpec;
    float windowLit = 0.0;
    if (uTexMode == 4) {
        float a = texture(uTex, vUv).a;
        fragColor = vec4(0.0, 0.0, 0.0, a * vAlpha);
        return;
    } else if (uTexMode == 1 || uTexMode == 5) {
        albedo *= texture(uTex, vUv).rgb;
    } else if (uTexMode == 2) {
        vec3 t1 = texture(uTex, vUv).rgb;
        vec3 t2 = texture(uTex, vUv * 0.137 + vec2(0.31, 0.77)).rgb;
        albedo *= mix(t1, t2, 0.45);
    } else if (uTexMode == 3) {
        vec4 tx = texture(uTex, vUv);
        albedo = mix(albedo * tx.rgb, tx.rgb, step(0.25, tx.a));
        spec = max(spec, step(0.25, tx.a) * 0.75);
        windowLit = step(0.75, tx.a);
    }
    vec3 N = normalize(vNormal);
    vec3 toCam = uCamPos - vWorld;
    float dist = length(toCam);
    vec3 V = toCam / max(dist, 0.001);
    float sh = shadowFactor();
    float ndl = max(dot(N, uSunDir), 0.0);
    vec3 hemi = mix(uGroundAmb, uSkyAmb, N.y * 0.5 + 0.5);
    vec3 light = hemi + uSunColor * ndl * sh;

    if (uHeadOn > 0.01) {
        vec3 d = vWorld - uHeadPos;
        float dl = length(d);
        vec3 dn = d / max(dl, 0.001);
        float cone = smoothstep(0.82, 0.97, dot(dn, uHeadDir));
        float att = uHeadOn * cone * 30.0 / (dl * dl * 0.06 + 3.0);
        light += vec3(1.0, 0.93, 0.8) * att * max(dot(N, -dn) * 0.7 + 0.3, 0.0);
    }
    if (uLampOn > 0.01 && vWorld.y < 3.0) {
        float m = mod(-vWorld.z - uLampPhase, uLampSpacing);
        float dz = min(m, uLampSpacing - m);
        float dx = abs(abs(vWorld.x) - uLampX);
        float pool = exp(-(dz * dz + dx * dx * 0.8) / 46.0);
        light += vec3(1.0, 0.74, 0.42) * uLampOn * 1.5 * pool * max(N.y, 0.15);
    }

    vec3 col = albedo * light;
    if (spec > 0.01) {
        vec3 H = normalize(uSunDir + V);
        float sp = pow(max(dot(N, H), 0.0), 16.0 + spec * 96.0) * spec * sh;
        col += uSunColor * sp * 1.2;
        vec3 R = reflect(-V, N);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 env = mix(uFogColor, uSkyTop, clamp(R.y * 1.4 + 0.25, 0.0, 1.0));
        col = mix(col, env, clamp((fres * 0.65 + 0.08) * spec * uReflect, 0.0, 0.85));
    }
    col += vColor * vEmis * 2.4;
    col += vec3(1.0, 0.82, 0.5) * windowLit * uNight * 1.1;

    float fd = dist * uFogDensity * uFogScale;
    float f = 1.0 - exp(-fd * fd);
    col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
    float alpha = 1.0;
    if (uGlass > 0.0) {
        // glass: more opaque (mirror-like) at grazing angles, tinted otherwise
        float fr = pow(1.0 - max(dot(N, V), 0.0), 2.0);
        alpha = clamp(uGlass + fr * 0.55, 0.0, 0.97);
    }
    fragColor = vec4(col, alpha);
}
"""

    const val DEPTH_VS = """#version 300 es
layout(location=0) in vec3 aPos;
layout(location=5) in vec4 iM0;
layout(location=6) in vec4 iM1;
layout(location=7) in vec4 iM2;
layout(location=8) in vec4 iM3;
uniform mat4 uLightVP;
void main() {
    mat4 m = mat4(iM0, iM1, iM2, iM3);
    gl_Position = uLightVP * (m * vec4(aPos, 1.0));
}
"""

    const val DEPTH_FS = """#version 300 es
precision mediump float;
void main() {
}
"""

    const val SKY_VS = """#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vNdc;
void main() {
    vNdc = aPos;
    gl_Position = vec4(aPos, 0.9999, 1.0);
}
"""

    const val SKY_FS = """#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uCamFwd;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec2 uTanHalf;
uniform vec3 uSkyTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uNight;
uniform float uTime;
uniform int uClouds;
out vec4 fragColor;

float hash3(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash2(i);
    float b = hash2(i + vec2(1.0, 0.0));
    float c = hash2(i + vec2(0.0, 1.0));
    float d = hash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        s += noise(p) * a;
        p *= 2.03;
        a *= 0.5;
    }
    return s;
}
void main() {
    vec3 dir = normalize(uCamFwd + vNdc.x * uTanHalf.x * uCamRight + vNdc.y * uTanHalf.y * uCamUp);
    float h = dir.y;
    vec3 col = mix(uHorizon, uSkyTop, pow(clamp(h, 0.0, 1.0), 0.5));
    if (h < 0.0) col = uHorizon;
    float sd = max(dot(dir, uSunDir), 0.0);
    col += uSunColor * (pow(sd, 900.0) * 8.0 + pow(sd, 24.0) * 0.28 + pow(sd, 4.0) * 0.08);
    if (uNight > 0.01 && h > 0.0) {
        vec3 q = floor(dir * 260.0);
        float s = hash3(q);
        float tw = 0.65 + 0.35 * sin(uTime * 3.0 + s * 90.0);
        col += vec3(step(0.9972, s)) * uNight * tw * smoothstep(0.0, 0.25, h);
    }
    if (uClouds == 1 && h > 0.01) {
        vec2 uv = dir.xz / (h + 0.12) * 1.4 + vec2(uTime * 0.012, uTime * 0.004);
        float n = fbm(uv);
        float c = smoothstep(0.48, 0.78, n) * smoothstep(0.01, 0.22, h);
        vec3 cloudCol = mix(uHorizon * 1.15, vec3(1.0), 0.45) * (1.0 - uNight * 0.85) + uSunColor * 0.15;
        col = mix(col, cloudCol, c * 0.65);
    }
    fragColor = vec4(col, 1.0);
}
"""

    const val SPRITE_VS = """#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iPosSize;
layout(location=2) in vec4 iColor;
uniform mat4 uViewProj;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamPos;
uniform float uFogDensity;
out vec2 vUv;
out vec4 vColor;
void main() {
    vec3 p = iPosSize.xyz + (uCamRight * aCorner.x + uCamUp * aCorner.y) * iPosSize.w;
    vUv = aCorner * 0.5 + 0.5;
    float d = length(iPosSize.xyz - uCamPos) * uFogDensity * 0.7;
    float fog = exp(-d * d);
    vColor = vec4(iColor.rgb, iColor.a * fog);
    gl_Position = uViewProj * vec4(p, 1.0);
}
"""

    const val SPRITE_FS = """#version 300 es
precision mediump float;
in vec2 vUv;
in vec4 vColor;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
    float a = texture(uTex, vUv).a * vColor.a;
    fragColor = vec4(vColor.rgb, a);
}
"""
    /** Full-screen post-processing (High/Ultra): radial speed blur, nitro heat haze, grading, vignette. */
    const val POST_VS = """#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}
"""

    const val POST_FS = """#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uScene;
uniform float uBlur;
uniform vec2 uCenter;
uniform float uHeat;
uniform vec2 uHeatPos;
uniform float uTime;
uniform float uVignette;
uniform float uGrade;
uniform float uFlash;
uniform float uAspect;
out vec4 fragColor;
void main() {
    vec2 uv = vUv;
    if (uHeat > 0.01) {
        vec2 d = (uv - uHeatPos) * vec2(uAspect, 1.0);
        float m = exp(-dot(d, d) * 38.0) * uHeat;
        uv += vec2(sin(uv.y * 160.0 + uTime * 31.0), cos(uv.x * 120.0 + uTime * 27.0)) * 0.0045 * m;
    }
    vec3 c = texture(uScene, uv).rgb;
    if (uBlur > 0.003) {
        vec2 dir = uv - uCenter;
        float edge = smoothstep(0.08, 0.55, length(dir * vec2(uAspect, 1.0)));
        vec2 stepv = dir * uBlur * edge * 0.022;
        vec3 acc = c;
        for (int i = 1; i < 7; i++) acc += texture(uScene, uv - stepv * float(i)).rgb;
        c = acc / 7.0;
    }
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, 1.0 + 0.14 * uGrade);
    c = (c - 0.5) * (1.0 + 0.07 * uGrade) + 0.5;
    c += vec3(0.010, 0.0, 0.018) * uGrade;
    vec2 q = (vUv - 0.5) * vec2(1.0, 0.85);
    float v = 1.0 - smoothstep(0.35, 0.85, length(q) * 1.1);
    c *= mix(1.0, 0.55 + 0.45 * v, uVignette);
    c = mix(c, vec3(1.0), uFlash);
    fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
"""
}
