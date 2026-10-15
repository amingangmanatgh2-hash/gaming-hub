package com.phantomops.launcher;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * PHANTOM OPS X independent launcher.
 * - Provisions the bundled standalone game on first run (fully offline afterwards).
 * - Checks the public update channel, downloads the new bundle and verifies every
 *   file with SHA-256 against update-manifest.json BEFORE swapping it in.
 * - Repair re-extracts the APK bundle. Player profiles live in WebView storage
 *   and are NEVER touched by update/repair (data preservation by design).
 */
public class MainActivity extends Activity {
    private static final String PREFS = "phantom_launcher";
    private static final String KEY_VERSION = "installed_version";

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private TextView logView;
    private TextView versionView;
    private ProgressBar progress;
    private Button playBtn;
    private WebView webView;
    private LinearLayout launcherUi;
    private boolean inGame = false;

    private File gameDir() { return new File(getFilesDir(), "game-current"); }
    private File stagingDir() { return new File(getFilesDir(), "game-staging"); }
    private File backupDir() { return new File(getFilesDir(), "game-backup"); }

    private SharedPreferences prefs() { return getSharedPreferences(PREFS, MODE_PRIVATE); }
    private String installedVersion() { return prefs().getString(KEY_VERSION, BuildConfig.BUNDLED_VERSION); }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildLauncherUi();
        log("PHANTOM OPS X launcher v" + BuildConfig.VERSION_NAME);
        log("Installed game bundle: v" + installedVersion());
        // First-run provisioning (or verify existing install) off the UI thread.
        io.execute(() -> {
            try {
                if (!new File(gameDir(), "index.html").exists()) {
                    log("First run: provisioning bundled game (works offline)…");
                    provisionFromAssets();
                    log("✔ Bundled game installed. You can play fully offline.");
                } else {
                    log("✔ Existing installation found. Ready.");
                }
            } catch (Exception e) {
                log("✖ Provisioning failed: " + e.getMessage() + " — try Repair.");
            }
            refreshVersion();
        });
        // Silent background update check (never blocks play).
        io.execute(() -> { try { checkForUpdates(false); } catch (Exception ignored) { } });
    }

    // ------------------------------------------------------------------ UI
    private void buildLauncherUi() {
        launcherUi = new LinearLayout(this);
        launcherUi.setOrientation(LinearLayout.VERTICAL);
        launcherUi.setPadding(40, 48, 40, 32);
        launcherUi.setBackgroundColor(Color.rgb(7, 10, 20));

        TextView title = new TextView(this);
        title.setText("PHANTOM OPS X");
        title.setTextColor(Color.rgb(168, 85, 247));
        title.setTextSize(30);
        title.setGravity(Gravity.CENTER);
        launcherUi.addView(title);

        TextView sub = new TextView(this);
        sub.setText("MAXIMUM FREEDOM FPS LAB — standalone & offline");
        sub.setTextColor(Color.rgb(34, 211, 238));
        sub.setGravity(Gravity.CENTER);
        sub.setPadding(0, 4, 0, 18);
        launcherUi.addView(sub);

        versionView = new TextView(this);
        versionView.setTextColor(Color.rgb(200, 210, 235));
        launcherUi.addView(versionView);

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        pp.setMargins(0, 14, 0, 10);
        launcherUi.addView(progress, pp);

        playBtn = new Button(this);
        playBtn.setText("▶  PLAY");
        playBtn.setTextSize(18);
        playBtn.setOnClickListener(v -> launchGame());
        launcherUi.addView(playBtn);

        Button updateBtn = new Button(this);
        updateBtn.setText("⟳  Check for updates");
        updateBtn.setOnClickListener(v -> io.execute(() -> { try { checkForUpdates(true); } catch (Exception e) { log("✖ Update error: " + e.getMessage()); } }));
        launcherUi.addView(updateBtn);

        Button repairBtn = new Button(this);
        repairBtn.setText("🛠  Repair installation (keeps profiles)");
        repairBtn.setOnClickListener(v -> io.execute(this::repair));
        launcherUi.addView(repairBtn);

        logView = new TextView(this);
        logView.setTextColor(Color.rgb(140, 240, 170));
        logView.setTextSize(11);
        logView.setTypeface(android.graphics.Typeface.MONOSPACE);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(logView);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        sp.setMargins(0, 16, 0, 0);
        launcherUi.addView(scroll, sp);

        TextView fine = new TextView(this);
        fine.setText("Independent experimental FPS. Not affiliated with Call of Duty. Profiles, inventory and settings are stored locally on this device only.");
        fine.setTextColor(Color.rgb(120, 130, 160));
        fine.setTextSize(10);
        launcherUi.addView(fine);

        setContentView(launcherUi);
        refreshVersion();
    }

    private void refreshVersion() {
        runOnUiThread(() -> versionView.setText("Installed: v" + installedVersion() + "   ·   Channel: " + BuildConfig.UPDATE_BASE_URL));
    }

    private void log(String line) {
        runOnUiThread(() -> {
            if (logView != null) {
                logView.append(line + "\n");
            }
        });
    }

    private void setProgress(int pct) {
        runOnUiThread(() -> progress.setProgress(Math.max(0, Math.min(100, pct))));
    }

    // ------------------------------------------------------------------ game
    @SuppressLint("SetJavaScriptEnabled")
    private void launchGame() {
        File index = new File(gameDir(), "index.html");
        if (!index.exists()) {
            log("✖ Game is not installed yet — wait for provisioning or tap Repair.");
            return;
        }
        // Serve the *installed* bundle (APK-provisioned or a verified update)
        // over a constant virtual HTTPS origin. A stable origin means WebView
        // localStorage (profiles/inventory) survives updates & repairs, and ES
        // modules load with correct MIME types (file:// cannot do that).
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/game/", path -> {
                    try {
                        File base = gameDir().getCanonicalFile();
                        File f = new File(base, path).getCanonicalFile();
                        if (!f.getPath().startsWith(base.getPath()) || !f.isFile()) return null;
                        return new WebResourceResponse(mimeFor(path), "UTF-8", new FileInputStream(f));
                    } catch (Exception e) {
                        return null;
                    }
                })
                .build();
        if (webView == null) {
            webView = new WebView(this);
            WebSettings s = webView.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true); // profiles/inventory persistence — never wiped by launcher
            s.setMediaPlaybackRequiresUserGesture(false);
            s.setLoadWithOverviewMode(true);
            s.setUseWideViewPort(true);
        }
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });
        setContentView(webView);
        inGame = true;
        webView.loadUrl("https://appassets.androidplatform.net/game/index.html");
        log("▶ Launching PHANTOM OPS X v" + installedVersion());
    }

    private static String mimeFor(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        if (inGame) {
            inGame = false;
            setContentView(launcherUi);
            if (webView != null) webView.loadUrl("about:blank");
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        io.shutdownNow();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ provisioning
    private void provisionFromAssets() throws Exception {
        File staging = stagingDir();
        deleteRecursive(staging);
        if (!staging.mkdirs() && !staging.exists()) throw new Exception("cannot create staging dir");
        copyAssetTree(getAssets(), "game", staging);
        verifyBundle(staging); // verify bundled files against bundled manifest
        swapIntoPlace(staging);
        prefs().edit().putString(KEY_VERSION, BuildConfig.BUNDLED_VERSION).apply();
    }

    private void copyAssetTree(AssetManager am, String assetPath, File destDir) throws Exception {
        String[] entries = am.list(assetPath);
        if (entries == null || entries.length == 0) {
            // leaf file
            File out = new File(destDir.getParentFile(), new File(assetPath).getName());
            try (InputStream in = am.open(assetPath); OutputStream os = new FileOutputStream(out)) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            }
            return;
        }
        if (!destDir.exists() && !destDir.mkdirs()) throw new Exception("mkdir failed: " + destDir);
        for (String e : entries) copyAssetTree(am, assetPath + "/" + e, new File(destDir, e));
    }

    // ------------------------------------------------------------------ update
    private void checkForUpdates(boolean manual) throws Exception {
        log("— Checking update channel…");
        setProgress(5);
        String manifestText;
        try {
            manifestText = httpGetText(BuildConfig.UPDATE_BASE_URL + "/update-manifest.json");
        } catch (Exception e) {
            log("✖ No connection (" + e.getMessage() + "). Offline-ready: v" + installedVersion() + " remains fully playable.");
            setProgress(100);
            return;
        }
        Manifest manifest = Manifest.parse(manifestText);
        if (manifest == null) { log("✖ Update manifest invalid — keeping current install."); return; }
        int cmp = compareVersions(manifest.version, installedVersion());
        if (cmp <= 0) {
            log(cmp == 0 ? "✔ Already up to date (v" + installedVersion() + ")." : "✔ Installed version is newer than the channel.");
            setProgress(100);
            return;
        }
        log("⬇ Update " + installedVersion() + " → " + manifest.version + " (" + manifest.files.size() + " files)");
        File staging = stagingDir();
        deleteRecursive(staging);
        if (!staging.mkdirs() && !staging.exists()) throw new Exception("cannot create staging dir");
        int done = 0;
        for (Map.Entry<String, String> f : manifest.files.entrySet()) {
            File out = new File(staging, f.getKey());
            if (out.getParentFile() != null) out.getParentFile().mkdirs();
            httpDownload(BuildConfig.UPDATE_BASE_URL + "/" + f.getKey(), out);
            String actual = sha256Hex(out);
            if (!actual.equalsIgnoreCase(f.getValue())) {
                deleteRecursive(staging);
                log("✖ SHA-256 mismatch on " + f.getKey() + " — update discarded, current install untouched.");
                setProgress(0);
                return;
            }
            done++;
            setProgress(10 + (int) (done * 80.0 / manifest.files.size()));
        }
        // write the fetched manifest into staging for future verification
        writeText(new File(staging, "update-manifest.json"), manifestText);
        swapIntoPlace(staging);
        prefs().edit().putString(KEY_VERSION, manifest.version).apply();
        setProgress(100);
        refreshVersion();
        log("✔ Update v" + manifest.version + " verified & installed. Press PLAY.");
    }

    private void verifyBundle(File dir) throws Exception {
        File mf = new File(dir, "update-manifest.json");
        if (!mf.exists()) return; // manifest absent in minimal bundles — nothing to verify against
        Manifest manifest = Manifest.parse(readText(mf));
        if (manifest == null) throw new Exception("bundled manifest invalid");
        for (Map.Entry<String, String> f : manifest.files.entrySet()) {
            File file = new File(dir, f.getKey());
            if (!file.exists()) throw new Exception("bundled file missing: " + f.getKey());
            if (!sha256Hex(file).equalsIgnoreCase(f.getValue())) throw new Exception("bundled file corrupt: " + f.getKey());
        }
    }

    private void swapIntoPlace(File staging) throws Exception {
        File backup = backupDir();
        deleteRecursive(backup);
        File current = gameDir();
        if (current.exists() && !current.renameTo(backup)) throw new Exception("backup of current install failed");
        if (!staging.renameTo(current)) {
            // rollback
            if (backup.exists()) backup.renameTo(current);
            throw new Exception("install swap failed — previous version restored");
        }
        deleteRecursive(backup);
    }

    // ------------------------------------------------------------------ repair
    private void repair() {
        try {
            log("🛠 Repair: restoring bundled game files…");
            log("  · Player profiles/inventory (WebView storage) are preserved by design.");
            deleteRecursive(gameDir());
            deleteRecursive(stagingDir());
            provisionFromAssets();
            refreshVersion();
            setProgress(100);
            log("✔ Repair complete. Bundle v" + BuildConfig.BUNDLED_VERSION + " reinstalled & verified.");
        } catch (Exception e) {
            log("✖ Repair failed: " + e.getMessage());
        }
    }

    // ------------------------------------------------------------------ helpers
    private static class Manifest {
        String version;
        final LinkedHashMap<String, String> files = new LinkedHashMap<>();
        static Manifest parse(String json) {
            if (json == null) return null;
            Matcher vm = Pattern.compile("\"version\"\\s*:\\s*\"([^\"]+)\"").matcher(json);
            if (!vm.find()) return null;
            Manifest m = new Manifest();
            m.version = vm.group(1);
            Matcher fm = Pattern.compile("\"([^\"]+)\"\\s*:\\s*\"([0-9a-fA-F]{64})\"").matcher(json);
            while (fm.find()) m.files.put(fm.group(1), fm.group(2));
            if (m.files.isEmpty()) return null;
            return m;
        }
    }

    static int compareVersions(String a, String b) {
        String[] pa = a.split("\\."), pb = b.split("\\.");
        int len = Math.max(pa.length, pb.length);
        for (int i = 0; i < len; i++) {
            int na = i < pa.length ? parseIntSafe(pa[i]) : 0;
            int nb = i < pb.length ? parseIntSafe(pb[i]) : 0;
            if (na != nb) return na < nb ? -1 : 1;
        }
        return 0;
    }
    private static int parseIntSafe(String s) { try { return Integer.parseInt(s.replaceAll("[^0-9]", "")); } catch (Exception e) { return 0; } }

    private String httpGetText(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(20000);
        try {
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
            try (InputStream in = c.getInputStream()) {
                return new String(readAll(in), "UTF-8");
            }
        } finally { c.disconnect(); }
    }

    private void httpDownload(String url, File out) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(60000);
        try {
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode() + " for " + url);
            try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                byte[] buf = new byte[32768];
                int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            }
        } finally { c.disconnect(); }
    }

    private static byte[] readAll(InputStream in) throws Exception {
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        return bos.toByteArray();
    }

    private static String sha256Hex(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[32768];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static void deleteRecursive(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) {
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) deleteRecursive(k);
        }
        f.delete();
    }

    private static String readText(File f) throws Exception {
        try (InputStream in = new FileInputStream(f)) { return new String(readAll(in), "UTF-8"); }
    }

    private static void writeText(File f, String text) throws Exception {
        try (OutputStream os = new FileOutputStream(f)) { os.write(text.getBytes("UTF-8")); }
    }
}
