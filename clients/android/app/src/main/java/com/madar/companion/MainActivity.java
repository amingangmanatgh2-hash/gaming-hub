package com.madar.companion;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
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

/** Live Worker dashboard and configuration companion. NOT an Android VPN service. */
public final class MainActivity extends Activity {
    private static final String PREF = "madar_companion";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private volatile int checkId = 0;
    private volatile boolean destroyed = false;
    private Runnable retryTask;
    private LinearLayout root;
    private WebView webView;
    private TextView statusText;
    private String origin = "";

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(10, 17, 30));
        getWindow().setNavigationBarColor(Color.rgb(10, 17, 30));
        String saved = getPreferences(MODE_PRIVATE).getString(PREF, "");
        String valid = validatedOrigin(saved);
        if (valid == null) valid = validatedOrigin(BuildConfig.DEFAULT_WORKER_ORIGIN);
        origin = valid == null ? "" : valid;
        buildView();
    }

    private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density + 0.5f); }

    private void buildView() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(10, 17, 30));
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setPadding(dp(12), dp(5), dp(12), dp(5));
        toolbar.setBackgroundColor(Color.rgb(17, 30, 43));
        TextView title = new TextView(this);
        title.setText("✦  مدار"); title.setTextColor(Color.rgb(192, 245, 220)); title.setTextSize(19);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(43), 1));
        Button retry = new Button(this);
        retry.setText("بازبینی"); retry.setTextSize(11);
        retry.setOnClickListener(v -> checkAndOpen());
        toolbar.addView(retry, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(45)));
        Button settings = new Button(this);
        settings.setText("نشانی سایت"); settings.setTextSize(11);
        settings.setOnClickListener(v -> askForOrigin());
        toolbar.addView(settings, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(45)));
        root.addView(toolbar);
        statusText = new TextView(this);
        statusText.setText("در انتظار دریافت تنظیمات از Worker…");
        statusText.setTextColor(Color.rgb(172, 220, 206)); statusText.setTextSize(12);
        statusText.setPadding(dp(15), dp(9), dp(15), dp(9));
        root.addView(statusText);
        webView = new WebView(this);
        webView.setVisibility(View.GONE);
        WebSettings options = webView.getSettings();
        options.setJavaScriptEnabled(true);
        options.setDomStorageEnabled(true);
        options.setAllowFileAccess(false);
        options.setAllowContentAccess(false);
        options.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        options.setJavaScriptCanOpenWindowsAutomatically(false);
        options.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                String scheme = target.getScheme();
                if ("https".equalsIgnoreCase(scheme) && (target.getPort() == -1 || target.getPort() == 443)
                    && origin.equalsIgnoreCase(scheme + "://" + target.getHost())) return false;
                if ("vless".equalsIgnoreCase(scheme)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, target)); }
                    catch (ActivityNotFoundException e) {
                        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                        clipboard.setPrimaryClip(ClipData.newPlainText("Madar configuration", target.toString()));
                        Toast.makeText(MainActivity.this, "کلاینت سازگار پیدا نشد؛ کانفیگ کپی شد.", Toast.LENGTH_LONG).show();
                    }
                    return true;
                }
                if ("https".equalsIgnoreCase(scheme)) startActivity(new Intent(Intent.ACTION_VIEW, target));
                else Toast.makeText(MainActivity.this, "این نشانی مجاز نیست.", Toast.LENGTH_SHORT).show();
                return true;
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler sslHandler, SslError error) {
                sslHandler.cancel();
                statusText.setText("گواهی HTTPS معتبر نیست؛ اتصال متوقف شد.");
            }
        });
        root.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        if (origin.isEmpty()) askForOrigin(); else checkAndOpen();
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

    private static final class Bootstrap {
        final boolean ready;
        final boolean pending;
        final String message;
        Bootstrap(boolean ready, boolean pending, String message) {
            this.ready = ready; this.pending = pending; this.message = message;
        }
    }

    private Bootstrap fetchBootstrap(String expected) {
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection) new URL(expected + "/api/v1/client/bootstrap").openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(4500); connection.setReadTimeout(4500);
            connection.setRequestProperty("Accept", "application/json");
            connection.setUseCaches(false);
            int code = connection.getResponseCode();
            if (code == 409) return new Bootstrap(false, true, "Worker آماده است؛ در انتظار تکمیل setup مدیر…");
            if (code != 200 || connection.getContentType() == null || !connection.getContentType().toLowerCase(Locale.ROOT).startsWith("application/json")
                || connection.getContentLength() > 8192) throw new Exception("Unexpected Worker response");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (InputStream in = connection.getInputStream()) {
                byte[] buf = new byte[1024]; int n;
                while ((n = in.read(buf)) != -1) {
                    if (out.size() + n > 8192) throw new Exception("Oversized response");
                    out.write(buf, 0, n);
                }
            }
            JSONObject data = new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
            if (!data.optBoolean("ok") || !data.optBoolean("initialized") || data.optInt("version") != 1
                || !expected.equals(data.optString("origin")) || !(expected + "/app").equals(data.optString("appUrl"))
                || !"vless-ws-tcp".equals(data.optString("transport"))) throw new Exception("Invalid bootstrap");
            return new Bootstrap(true, false, "تنظیمات زنده از Worker دریافت شد.");
        } catch (Exception e) {
            return new Bootstrap(false, false, "Worker پاسخ نداد؛ HTTPS و وضعیت شبکه را بررسی کنید. تلاش مجدد خودکار است.");
        } finally { if (connection != null) connection.disconnect(); }
    }

    private void checkAndOpen() {
        if (origin.isEmpty() || destroyed) return;
        if (retryTask != null) handler.removeCallbacks(retryTask);
        final int id = ++checkId;
        final String target = origin;
        statusText.setText("در حال دریافت تنظیمات از Worker…");
        executor.execute(() -> {
            Bootstrap result = null;
            for (int attempt = 0; attempt < 3; attempt++) {
                if (destroyed || id != checkId) return;
                result = fetchBootstrap(target);
                if (result.ready || result.pending) break;
                if (attempt < 2) {
                    try { Thread.sleep(300L * (1 << attempt)); }
                    catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
                }
            }
            final Bootstrap outcome = result;
            handler.post(() -> {
                if (destroyed || id != checkId || !target.equals(origin)) return;
                statusText.setText(outcome.message);
                if (outcome.ready) {
                    webView.setVisibility(View.VISIBLE);
                    webView.loadUrl(target + "/app");
                } else {
                    retryTask = this::checkAndOpen;
                    handler.postDelayed(retryTask, outcome.pending ? 12000L : 18000L);
                }
            });
        });
    }

    private void askForOrigin() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setHint("https://your-worker.workers.dev");
        input.setText(origin);
        LinearLayout box = new LinearLayout(this); box.setPadding(dp(20), dp(5), dp(20), 0); box.addView(input);
        new AlertDialog.Builder(this).setTitle("آدرس Worker یا دامنهٔ مدار")
            .setMessage("نسخهٔ وابسته به استقرار آدرس را از قبل دارد. اگر لازم است آدرس HTTPS خودتان را وارد کنید؛ این اپ VPN نیست.")
            .setView(box).setCancelable(!origin.isEmpty())
            .setPositiveButton("ذخیره و بررسی", (dialog, which) -> {
                String valid = validatedOrigin(input.getText().toString());
                if (valid == null) { Toast.makeText(this, "نشانی عمومی HTTPS معتبر وارد کنید.", Toast.LENGTH_LONG).show(); askForOrigin(); return; }
                origin = valid;
                getPreferences(MODE_PRIVATE).edit().putString(PREF, origin).apply();
                webView.stopLoading(); webView.setVisibility(View.GONE);
                checkAndOpen();
            })
            .setNegativeButton(origin.isEmpty() ? "خروج" : "انصراف", (dialog, which) -> { if (origin.isEmpty()) finish(); })
            .show();
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.getVisibility() == View.VISIBLE && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        destroyed = true;
        checkId++;
        if (retryTask != null) handler.removeCallbacks(retryTask);
        executor.shutdownNow();
        if (webView != null) { root.removeView(webView); webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
