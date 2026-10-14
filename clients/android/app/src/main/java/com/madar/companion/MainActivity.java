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

/** Installable companion for the Cloudflare-hosted dashboard; NOT an Android VPN service. */
public final class MainActivity extends Activity {
    private static final String PREF = "madar_companion";
    private LinearLayout root;
    private WebView webView;
    private String origin;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(10, 17, 30));
        getWindow().setNavigationBarColor(Color.rgb(10, 17, 30));
        origin = getPreferences(MODE_PRIVATE).getString(PREF, "");
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
        Button settings = new Button(this);
        settings.setText("نشانی سایت"); settings.setTextSize(11);
        settings.setOnClickListener(v -> askForOrigin());
        toolbar.addView(settings, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(45)));
        root.addView(toolbar);
        webView = new WebView(this);
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
                if ("https".equalsIgnoreCase(scheme) && origin.equalsIgnoreCase(target.getScheme() + "://" + target.getHost())) return false;
                if ("vless".equalsIgnoreCase(scheme)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, target)); }
                    catch (ActivityNotFoundException e) {
                        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                        clipboard.setPrimaryClip(ClipData.newPlainText("Madar configuration", target.toString()));
                        Toast.makeText(MainActivity.this, "کلاینت سازگار پیدا نشد؛ کانفیگ کپی شد.", Toast.LENGTH_LONG).show();
                    }
                    return true;
                }
                if ("https".equalsIgnoreCase(scheme)) {
                    startActivity(new Intent(Intent.ACTION_VIEW, target));
                } else {
                    Toast.makeText(MainActivity.this, "این نشانی مجاز نیست.", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                Toast.makeText(MainActivity.this, "گواهی HTTPS معتبر نیست؛ اتصال متوقف شد.", Toast.LENGTH_LONG).show();
            }
        });
        root.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        if (origin.isEmpty()) askForOrigin(); else webView.loadUrl(origin + "/app");
    }

    private static String validatedOrigin(String raw) {
        try {
            Uri url = Uri.parse(raw.trim());
            String host = url.getHost();
            if (!"https".equalsIgnoreCase(url.getScheme()) || host == null || !host.matches("(?i)[a-z0-9.-]+")
                || !host.contains(".") || host.matches("[0-9.]+") || host.endsWith(".local") || host.endsWith(".internal")
                || (url.getPort() != -1 && url.getPort() != 443) || url.getEncodedAuthority().contains("@")) return null;
            return "https://" + host.toLowerCase();
        } catch (Exception e) { return null; }
    }

    private void askForOrigin() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setHint("https://your-worker.workers.dev");
        input.setText(origin);
        LinearLayout box = new LinearLayout(this); box.setPadding(dp(20), dp(5), dp(20), 0); box.addView(input);
        new AlertDialog.Builder(this).setTitle("آدرس Worker یا دامنهٔ مدار")
            .setMessage("آدرس HTTPS استقرار خود را وارد کنید. این اپ فقط داشبورد و کانفیگ را نمایش می‌دهد و خودش VPN نیست.")
            .setView(box).setCancelable(!origin.isEmpty())
            .setPositiveButton("ذخیره و بازکردن", (dialog, which) -> {
                String valid = validatedOrigin(input.getText().toString());
                if (valid == null) { Toast.makeText(this, "نشانی HTTPS معتبر وارد کنید.", Toast.LENGTH_LONG).show(); askForOrigin(); return; }
                origin = valid;
                getPreferences(MODE_PRIVATE).edit().putString(PREF, origin).apply();
                webView.loadUrl(origin + "/app");
            })
            .setNegativeButton(origin.isEmpty() ? "خروج" : "انصراف", (dialog, which) -> { if (origin.isEmpty()) finish(); })
            .show();
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if (webView != null) { root.removeView(webView); webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
