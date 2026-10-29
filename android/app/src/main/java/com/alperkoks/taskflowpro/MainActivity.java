package com.alperkoks.taskflowpro;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Android pencere, statusBar, navBar ve DecorView zemin rengini obsidian siyaha (#09090d) bağla
        if (getWindow() != null) {
            if (getWindow().getDecorView() != null) {
                getWindow().getDecorView().setBackgroundColor(Color.parseColor("#09090d"));
            }
            getWindow().setStatusBarColor(Color.parseColor("#09090d"));
            getWindow().setNavigationBarColor(Color.parseColor("#09090d"));
        }

        // 2. WebView zeminini obsidian siyaha sabitle ve overscroll sıçramasını önle
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setBackgroundColor(Color.parseColor("#09090d"));
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            webView.post(() -> {
                View parent = (View) webView.getParent();
                if (parent != null) {
                    parent.setBackgroundColor(Color.parseColor("#09090d"));
                }
            });
        }

        // 3. Android 13/14/15+ Yeni Donanım & Jest / Kenardan Kaydırma Geri Tuşu Yönetimi
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                        "(function() { try { if (window.handleNativeHardwareBackButton) { window.handleNativeHardwareBackButton(); return true; } } catch(e){} return false; })();",
                        null
                    );
                }
            }
        });
    }

    // Eski Android sürümleri için yedek onBackPressed
    @Override
    public void onBackPressed() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript(
                "(function() { try { if (window.handleNativeHardwareBackButton) { window.handleNativeHardwareBackButton(); return true; } } catch(e){} return false; })();",
                null
            );
        } else {
            super.onBackPressed();
        }
    }
}
