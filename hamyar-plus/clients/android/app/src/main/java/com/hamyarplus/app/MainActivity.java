package com.hamyarplus.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.HttpsURLConnection;

/**
 * همیار پلاس — پوستهٔ هیبرید:
 * اینترنت + سایت در دسترس باشد ← نسخهٔ آنلاین سایت (همیشه تازه)
 * نباشد ← نسخهٔ سبک لوکال داخل APK (assets/www)؛ وقتی شبکه برگشت، خودکار به آنلاین سوئیچ می‌کند.
 */
public final class MainActivity extends Activity {
    private static final String PREF_ORIGIN = "site_origin";
    private static final String LOCAL_URL = "file:///android_asset/www/index.html";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private volatile int checkId = 0;
    private volatile boolean destroyed = false;
    private LinearLayout root;
    private WebView webView;
    private TextView statusText;
    private String origin = "";
    private boolean onlineMode = false;
    private ConnectivityManager.NetworkCallback netCallback;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(11, 16, 38));
        getWindow().setNavigationBarColor(Color.rgb(11, 16, 38));
        String valid = validatedOrigin(getPreferences(MODE_PRIVATE).getString(PREF_ORIGIN, ""));
        if (valid == null) valid = validatedOrigin(BuildConfig.DEFAULT_SITE_ORIGIN);
        origin = valid == null ? "" : valid;
        buildView();
        watchNetwork();
        start();
    }

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + 0.5f); }

    private void buildView() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(11, 16, 38));
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setPadding(dp(12), dp(4), dp(12), dp(4));
        toolbar.setBackgroundColor(Color.rgb(17, 23, 54));
        TextView title = new TextView(this);
        title.setText("📚 همیار پلاس"); title.setTextColor(Color.WHITE); title.setTextSize(17);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(44), 1));
        Button retry = new Button(this);
        retry.setText("🔄 اتصال"); retry.setTextSize(11);
        retry.setOnClickListener(v -> start());
        toolbar.addView(retry, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(44)));
        Button settings = new Button(this);
        settings.setText("نشانی سایت"); settings.setTextSize(11);
        settings.setOnClickListener(v -> askForOrigin());
        toolbar.addView(settings, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(44)));
        root.addView(toolbar);

        statusText = new TextView(this);
        statusText.setTextColor(Color.rgb(168, 176, 216)); statusText.setTextSize(11.5f);
        statusText.setPadding(dp(14), dp(6), dp(14), dp(6));
        root.addView(statusText);

        webView = new WebView(this);
        WebSettings options = webView.getSettings();
        options.setJavaScriptEnabled(true);
        options.setDomStorageEnabled(true);
        options.setAllowFileAccess(true);            // فقط برای assets داخلی برنامه
        options.setAllowContentAccess(false);
        options.setAllowFileAccessFromFileURLs(false);
        options.setAllowUniversalAccessFromFileURLs(false);
        options.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        options.setJavaScriptCanOpenWindowsAutomatically(false);
        options.setMediaPlaybackRequiresUserGesture(true);
        options.setCacheMode(WebSettings.LOAD_DEFAULT);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                String scheme = target.getScheme() == null ? "" : target.getScheme();
                String url = target.toString();
                if (url.startsWith("file:///android_asset/")) return false; // نسخهٔ لوکال
                if ("https".equalsIgnoreCase(scheme) && !origin.isEmpty()
                    && origin.equalsIgnoreCase("https://" + target.getHost())) return false; // سایت خودمان
                if ("https".equalsIgnoreCase(scheme)) { startActivity(new Intent(Intent.ACTION_VIEW, target)); return true; }
                Toast.makeText(MainActivity.this, "این نشانی در برنامه باز نمی‌شود.", Toast.LENGTH_SHORT).show();
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // اگر صفحهٔ اصلی سایت لود نشد، بی‌صدا برو روی نسخهٔ لوکال
                if (request.isForMainFrame() && onlineMode) {
                    loadLocal("سایت پاسخ نداد؛ نسخهٔ لوکال (آفلاین) فعال شد 📦");
                    scheduleRecheck();
                }
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler sslHandler, SslError error) {
                sslHandler.cancel();
                if (onlineMode) loadLocal("گواهی HTTPS سایت معتبر نبود؛ نسخهٔ لوکال فعال شد 📦");
            }
        });
        root.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
    }

    /** تصمیم آغازین: اول سایت را امتحان کن؛ نشد لوکال. */
    private void start() {
        if (origin.isEmpty()) { loadLocal("📦 حالت کاملاً لوکال — آدرس سایت را می‌توانی از دکمهٔ «نشانی سایت» وارد کنی"); return; }
        setStatus("در حال بررسی اتصال به سایت…");
        checkSite(true);
    }

    private void checkSite(boolean firstRun) {
        if (destroyed || origin.isEmpty()) return;
        final int id = ++checkId;
        final String target = origin;
        executor.execute(() -> {
            boolean ok = fetchBootstrap(target);
            handler.post(() -> {
                if (destroyed || id != checkId || !target.equals(origin)) return;
                if (ok) {
                    if (!onlineMode) {
                        onlineMode = true;
                        setStatus("🟢 آنلاین شدی؛ نسخهٔ تازهٔ سایت بارگذاری شد");
                        webView.loadUrl(target + "/");
                    } else setStatus("🟢 متصل به سایت");
                } else if (firstRun) {
                    loadLocal("📴 اینترنت یا سایت در دسترس نیست؛ نسخهٔ سبک لوکال فعال است");
                    scheduleRecheck();
                } else {
                    setStatus("📦 لوکال — هر وقت نت برگردد خودکار آنلاین می‌شویم");
                    scheduleRecheck();
                }
            });
        });
    }

    private void scheduleRecheck() {
        handler.postDelayed(() -> { if (!destroyed && !onlineMode) checkSite(false); }, 30000L);
    }

    private void loadLocal(String message) {
        onlineMode = false;
        setStatus(message);
        String current = webView.getUrl();
        if (current == null || !current.startsWith(LOCAL_URL)) webView.loadUrl(LOCAL_URL);
    }

    private void setStatus(String msg) { if (statusText != null) statusText.setText(msg); }

    /** وقتی شبکه برگشت، دوباره سایت را بررسی کن تا خودکار آنلاین شویم. */
    private void watchNetwork() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (cm == null) return;
            netCallback = new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network network) {
                    handler.post(() -> { if (!destroyed && !onlineMode && !origin.isEmpty()) checkSite(false); });
                }
            };
            cm.registerDefaultNetworkCallback(netCallback);
        } catch (Exception ignored) { /* بررسی زمان‌بندی‌شده همچنان کار می‌کند */ }
    }

    private boolean fetchBootstrap(String expected) {
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection) new URL(expected + "/api/v1/client/bootstrap").openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(4000); connection.setReadTimeout(4000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setUseCaches(false);
            if (connection.getResponseCode() != 200) return false;
            String ct = connection.getContentType();
            if (ct == null || !ct.toLowerCase(Locale.ROOT).startsWith("application/json") || connection.getContentLength() > 16384) return false;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (InputStream in = connection.getInputStream()) {
                byte[] buf = new byte[1024]; int n;
                while ((n = in.read(buf)) != -1) { if (out.size() + n > 16384) return false; out.write(buf, 0, n); }
            }
            JSONObject data = new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
            return data.optBoolean("ok") && "hamyar-plus".equals(data.optString("app"))
                && expected.equals(data.optString("origin"));
        } catch (Exception e) { return false; }
        finally { if (connection != null) connection.disconnect(); }
    }

    private static String validatedOrigin(String raw) {
        try {
            if (raw == null || raw.length() > 500) return null;
            Uri url = Uri.parse(raw.trim());
            String host = url.getHost();
            if (!"https".equalsIgnoreCase(url.getScheme()) || host == null || url.getEncodedAuthority().contains("@")
                || (url.getPort() != -1 && url.getPort() != 443)
                || (url.getPath() != null && !url.getPath().isEmpty() && !"/".equals(url.getPath()))
                || url.getQuery() != null || url.getFragment() != null) return null;
            host = host.toLowerCase(Locale.ROOT);
            if (host.length() > 253 || !host.matches("(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?")
                || host.matches(".*\\.(local|internal|test|invalid|example|onion|arpa)$")) return null;
            return "https://" + host;
        } catch (Exception e) { return null; }
    }

    private void askForOrigin() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setHint("https://hamyar-plus.pages.dev");
        input.setText(origin);
        LinearLayout box = new LinearLayout(this); box.setPadding(dp(20), dp(5), dp(20), 0); box.addView(input);
        new AlertDialog.Builder(this).setTitle("آدرس سایت همیار پلاس")
            .setMessage("اگر سایت را روی Cloudflare نصب کرده‌ای آدرسش را بده تا اپ از سایت بالا بیاید و خودکار به‌روز شود. خالی هم بگذاری اپ کاملاً آفلاین و لوکال کار می‌کند.")
            .setView(box)
            .setPositiveButton("ذخیره و بررسی", (dialog, which) -> {
                String raw = input.getText().toString().trim();
                if (raw.isEmpty()) {
                    origin = "";
                    getPreferences(MODE_PRIVATE).edit().putString(PREF_ORIGIN, "").apply();
                    loadLocal("📦 حالت کاملاً لوکال فعال است");
                    return;
                }
                String valid = validatedOrigin(raw);
                if (valid == null) { Toast.makeText(this, "نشانی عمومی HTTPS معتبر وارد کن.", Toast.LENGTH_LONG).show(); askForOrigin(); return; }
                origin = valid;
                getPreferences(MODE_PRIVATE).edit().putString(PREF_ORIGIN, origin).apply();
                onlineMode = false;
                checkSite(true);
            })
            .setNegativeButton("انصراف", null)
            .show();
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        destroyed = true;
        checkId++;
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (cm != null && netCallback != null) cm.unregisterNetworkCallback(netCallback);
        } catch (Exception ignored) { }
        executor.shutdownNow();
        if (webView != null) { root.removeView(webView); webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
